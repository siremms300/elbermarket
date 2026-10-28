// Transport reference generator.
//
// Every transport request gets a human-readable, globally unique reference
// like "TRP-A3K9M2X7". The reference is:
//
//   - Short enough to say over the phone or copy in chat
//   - Sortable (fixed length, so it aligns in lists)
//   - Free of ambiguous characters (no 0/O, 1/I/L, 2/Z)
//   - Guaranteed unique via DB-level retry on collision
//
// The generator produces the string; the service ensures uniqueness by
// inserting and retrying if the DB rejects on the UNIQUE constraint.
// Statistically, collisions are so rare (36^8 = 2.8 trillion) that a
// retry loop will never need more than one attempt in practice — but the
// loop exists because "in practice" is not "guaranteed."

package transport

import (
	"crypto/rand"
	"math/big"
)

// referenceAlphabet is the character set used in references. Deliberately
// excludes:
//   - 0, O: indistinguishable in many fonts
//   - 1, I, L: indistinguishable in many fonts
//   - 2, Z: indistinguishable in some contexts
//
// The remaining 30 characters give 30^8 ≈ 656 billion possible references —
// still ample for a platform of any size.
const referenceAlphabet = "ABCDEFGHJKMNPQRSTUVWXY3456789"

// referenceLength is how many characters follow the "TRP-" prefix.
// 8 gives ~656 billion possibilities with the restricted alphabet above.
const referenceLength = 8

// generateReference returns a new transport reference in the form
// "TRP-XXXXXXXX" where XXXXXXXX are drawn from referenceAlphabet.
//
// Uses crypto/rand for cryptographic unpredictability — prevents
// attackers from guessing references in sequence.
func generateReference() (string, error) {
	const prefix = "TRP-"
	result := make([]byte, len(prefix)+referenceLength)
	copy(result, prefix)

	alphabetLen := big.NewInt(int64(len(referenceAlphabet)))
	for i := 0; i < referenceLength; i++ {
		n, err := rand.Int(rand.Reader, alphabetLen)
		if err != nil {
			return "", err
		}
		result[len(prefix)+i] = referenceAlphabet[n.Int64()]
	}

	return string(result), nil
}