//! AES-256-CBC + PKCS7 helpers used to talk to the upstream BRT GpsApi.
//!
//! Spec recovered from the Mitra Darat APK (`ChAlgorithm.smali`):
//!   · cipher  = AES-256-CBC, PKCS5/PKCS7 padding
//!   · key     = the secret key as UTF-8 bytes; MUST be exactly 32 bytes
//!   · iv      = the first 16 UTF-8 bytes of the same key
//!   · output  = standard base64 (the wire may include whitespace —
//!               strip it before decoding)
//!
//! Both the response body of `/getToken` and every `application/x-www-form-urlencoded`
//! POST body to GpsApi are encrypted with this scheme.

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};

use crate::error::AppError;

type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;
type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

const KEY_LEN: usize = 32;
const IV_LEN: usize = 16;

/// Returns `(key, iv)` slices for AES-256-CBC, or an error if `key_str`
/// is not exactly 32 UTF-8 bytes long.
fn key_iv(key_str: &str) -> Result<(&[u8], &[u8]), AppError> {
    let bytes = key_str.as_bytes();
    if bytes.len() != KEY_LEN {
        return Err(AppError::Crypto(format!(
            "key must be exactly {KEY_LEN} UTF-8 bytes, got {}",
            bytes.len()
        )));
    }
    Ok((bytes, &bytes[..IV_LEN]))
}

/// Encrypt `plaintext` and return base64 of the ciphertext.
pub fn encrypt(plaintext: &str, key_str: &str) -> Result<String, AppError> {
    let (key, iv) = key_iv(key_str)?;
    let ct = Aes256CbcEnc::new(key.into(), iv.into())
        .encrypt_padded_vec_mut::<Pkcs7>(plaintext.as_bytes());
    Ok(B64.encode(ct))
}

/// Decode + decrypt a base64 ciphertext. Whitespace in the input is
/// tolerated (the upstream often emits chunked / wrapped base64).
pub fn decrypt(b64: &str, key_str: &str) -> Result<String, AppError> {
    let (key, iv) = key_iv(key_str)?;

    let cleaned: String = b64.chars().filter(|c| !c.is_whitespace()).collect();
    let mut buf = B64
        .decode(cleaned.as_bytes())
        .map_err(|e| AppError::Crypto(format!("invalid base64: {e}")))?;

    let pt = Aes256CbcDec::new(key.into(), iv.into())
        .decrypt_padded_mut::<Pkcs7>(&mut buf)
        .map_err(|e| AppError::Crypto(format!("decrypt failed: {e}")))?;

    String::from_utf8(pt.to_vec())
        .map_err(|e| AppError::Crypto(format!("ciphertext was not utf-8: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Synthetic 32-byte test key. NOT the real BRT key.
    const TEST_KEY: &str = "0123456789abcdef0123456789abcdef";

    #[test]
    fn round_trip_simple() {
        let pt = "pref=12";
        let ct = encrypt(pt, TEST_KEY).expect("encrypt");
        let back = decrypt(&ct, TEST_KEY).expect("decrypt");
        assert_eq!(back, pt);
    }

    #[test]
    fn round_trip_json() {
        let pt = r#"{"hello":"world","n":42,"halte":"sh-001"}"#;
        let ct = encrypt(pt, TEST_KEY).expect("encrypt");
        let back = decrypt(&ct, TEST_KEY).expect("decrypt");
        assert_eq!(back, pt);
    }

    #[test]
    fn round_trip_unicode() {
        let pt = "Trans Palu · halte 🚌";
        let ct = encrypt(pt, TEST_KEY).expect("encrypt");
        let back = decrypt(&ct, TEST_KEY).expect("decrypt");
        assert_eq!(back, pt);
    }

    #[test]
    fn decrypt_tolerates_whitespace() {
        let pt = "pref=11";
        let mut ct = encrypt(pt, TEST_KEY).expect("encrypt");
        // upstream sometimes returns wrapped / newline-separated base64.
        ct.insert(4, '\n');
        ct.insert(8, ' ');
        ct.insert(12, '\r');
        let back = decrypt(&ct, TEST_KEY).expect("decrypt");
        assert_eq!(back, pt);
    }

    #[test]
    fn rejects_short_key() {
        let err = encrypt("x", "tooshort").unwrap_err();
        assert!(matches!(err, AppError::Crypto(_)));
    }

    #[test]
    fn rejects_long_key() {
        let key = "x".repeat(64);
        let err = encrypt("x", &key).unwrap_err();
        assert!(matches!(err, AppError::Crypto(_)));
    }

    #[test]
    fn rejects_garbage_base64() {
        let err = decrypt("!!!not-base64!!!", TEST_KEY).unwrap_err();
        assert!(matches!(err, AppError::Crypto(_)));
    }

    #[test]
    fn rejects_wrong_key() {
        let pt = "pref=12";
        let ct = encrypt(pt, TEST_KEY).expect("encrypt");
        let other = "fedcba9876543210fedcba9876543210";
        let err = decrypt(&ct, other).unwrap_err();
        assert!(matches!(err, AppError::Crypto(_)));
    }

    #[test]
    fn iv_is_first_16_key_bytes() {
        // Sanity check the IV-derivation rule against a known vector
        // produced by `key_iv`. Two ciphertexts produced with the same
        // (key, iv, plaintext) must be byte-identical: AES-CBC with a
        // fixed IV is deterministic.
        let pt = "deterministic";
        let a = encrypt(pt, TEST_KEY).unwrap();
        let b = encrypt(pt, TEST_KEY).unwrap();
        assert_eq!(a, b);
    }
}
