const EXPONENT_MAX = 6111n;
const EXPONENT_MIN = -6176n;
const EXPONENT_BIAS = 6176n;
const MAX_DIGITS = 34;

const PARSE_STRING_REGEXP = /^(\+|-)?(\d+|(\d*\.\d*))?(E|e)?([-+])?(\d+)?$/;
const PARSE_INF_REGEXP = /^(\+|-)?(Infinity|inf)$/i;
const PARSE_NAN_REGEXP = /^(\+|-)?NaN$/i;
const EXPONENT_REGEX = /^([-+])?(\d+)?$/;

// Nan value bits as 32 bit values (due to lack of longs)
const NAN_BUFFER = new Uint8Array([
    0x7c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
].reverse());
// Infinity value bits 32 bit values (due to lack of longs)
const INF_NEGATIVE_BUFFER = new Uint8Array([
    0xf8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
].reverse());
const INF_POSITIVE_BUFFER = new Uint8Array([
    0x78, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
].reverse());

const ASCII_ZERO = '0'.charCodeAt(0)
// Extract least significant 5 bits
const COMBINATION_MASK = 0x1fn;
// Extract least significant 14 bits
const EXPONENT_MASK = 0x3FFFn;
// Value of combination field for Inf
const COMBINATION_INFINITY = 30n;
// Value of combination field for NaN
const COMBINATION_NAN = 31n;


/** Create a string representation of the raw Decimal128 value */
function toString(buffer: Uint8Array): string {
    // Note: bits in this routine are referred to starting at 0,
    // from the sign bit, towards the coefficient.

    const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)

    // decoded biased exponent (14 bits)
    let biased_exponent;
    // the number of significand digits
    let significand_digits = 0;
    // the base-10 digits in the significand
    const significand = Object.seal(new Array<number>(36).fill(0));


    // true if the number is zero
    let is_zero = false;

    // the most significant significand bits (50-46)
    let significand_msb;

    // Output string
    const string: string[] = [];

    const lo64 = dv.getBigUint64(0, true)
    const hi64 = dv.getBigUint64(8, true)

    const asBigInt = hi64 << 64n | lo64

    if (asBigInt & 0x8000_0000_0000_0000_0000_0000_0000_0000n) {
        // sign bit is set
        string.push('-');
    }

    // Decode combination field and exponent
    // bits 1 - 5
    const combination = (asBigInt >> 122n) & COMBINATION_MASK;

    if (combination >> 3n === 0b11n) {
        // Check for 'special' values
        if (combination === COMBINATION_INFINITY) {
            return string.join('') + 'Infinity';
        } else if (combination === COMBINATION_NAN) {
            return 'NaN';
        } else {
            biased_exponent = (asBigInt >> 111n) & EXPONENT_MASK;
            significand_msb = 0b1000n + ((asBigInt >> 110n) & 0b1n);
        }
    } else {
        significand_msb = (asBigInt >> 110n) & 0b111n;
        biased_exponent = (asBigInt >> 113n) & EXPONENT_MASK;
    }

    // unbiased exponent
    const exponent = Number(biased_exponent - EXPONENT_BIAS);

    // Create string of significand digits

    // Convert the 114-bit binary number represented by
    // (significand_high, significand_low) to at most 34 decimal
    // digits through modulo and division.
    const maskBottomSig = asBigInt & 0x0000_3FFF_FFFF_FFFF_FFFF_FFFF_FFFF_FFFFn
    const maskBottomMsb = significand_msb & 0xFn
    const shiftBtmMsb = maskBottomMsb << 110n
    const significand128 = shiftBtmMsb | maskBottomSig

    if (significand128 === 0n) {
        is_zero = true;
    } else {
        let least_digits = significand128
        for (let i = 35; i >= 0; i--) {
            significand[i] = Number(least_digits % 10n)
            least_digits /= 10n
        }
    }

    // Output format options:
    // Scientific - [-]d.dddE(+/-)dd or [-]dE(+/-)dd
    // Regular    - ddd.ddd

    // read pointer into significand
    let index = 0;

    if (is_zero) {
        significand_digits = 1;
        significand[index] = 0;
    } else {
        significand_digits = 36;
        while (significand[index] === 0) {
            significand_digits = significand_digits - 1;
            index = index + 1;
        }
    }

    // the exponent if scientific notation is used
    const scientific_exponent = significand_digits - 1 + exponent;

    // The scientific exponent checks are dictated by the string conversion
    // specification and are somewhat arbitrary cutoffs.
    //
    // We must check exponent > 0, because if this is the case, the number
    // has trailing zeros.  However, we *cannot* output these trailing zeros,
    // because doing so would change the precision of the value, and would
    // change stored data if the string converted number is round tripped.
    if (scientific_exponent >= 34 || scientific_exponent <= -7 || exponent > 0) {
        // Scientific format

        // if there are too many significant digits, we should just be treating numbers
        // as + or - 0 and using the non-scientific exponent (this is for the "invalid
        // representation should be treated as 0/-0" spec cases in decimal128-1.json)
        if (significand_digits > 34) {
            string.push(`${0}`);
            if (exponent > 0) string.push('E+' + exponent);
            else if (exponent < 0) string.push('E' + exponent);
            return string.join('');
        }

        string.push(`${significand[index++]}`);
        significand_digits = significand_digits - 1;

        if (significand_digits) {
            string.push('.');
        }

        for (let i = 0; i < significand_digits; i++) {
            string.push(`${significand[index++]}`);
        }

        // Exponent
        string.push('E');
        if (scientific_exponent > 0) {
            string.push('+' + scientific_exponent);
        } else {
            string.push(`${scientific_exponent}`);
        }
    } else {
        // Regular format with no decimal place
        if (exponent >= 0) {
            for (let i = 0; i < significand_digits; i++) {
                string.push(`${significand[index++]}`);
            }
        } else {
            let radix_position = significand_digits + exponent;

            // non-zero digits before radix
            if (radix_position > 0) {
                for (let i = 0; i < radix_position; i++) {
                    string.push(`${significand[index++]}`);
                }
            } else {
                string.push('0');
            }

            string.push('.');
            // add leading zeros after radix
            while (radix_position++ < 0) {
                string.push('0');
            }

            for (let i = 0; i < significand_digits - Math.max(radix_position - 1, 0); i++) {
                string.push(`${significand[index++]}`);
            }
        }
    }

    return string.join('');
}

const invalidErr = (string: string, message: string) => {
    throw new Error(`"${string}" is not a valid Decimal128 string - ${message}`);
}

const decimalDigits = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
const isDigit = (value: string): boolean => decimalDigits.has(value)
const parseDigit = (value: string): number => value?.charCodeAt(0) - ASCII_ZERO

/**
 * Create a Decimal128 instance from a string representation
 *
 * @param representation - a numeric string representation.
 */
function fromString(representation: string): Uint8Array {
    // Parse state tracking
    let isNegative = false;
    let sawRadix = false;
    let foundNonZero = false;

    // Total number of significant digits (no leading or trailing zero)
    let significantDigits = 0;
    // Total number of significand digits read
    let nDigitsRead = 0;
    // Total number of digits (no leading zeros)
    let nDigits = 0;
    // The number of the digits after radix
    let radixPosition = 0n;
    // The index of the first non-zero in *str*
    let firstNonZero = 0;

    // Digits Array
    const digits = [0];
    // The number of digits in digits
    let nDigitsStored = 0;
    // Insertion pointer for digits
    let digitsInsert = 0;
    // The index of the first non-zero digit
    let firstDigit = 0;
    // The index of the last digit
    let lastDigit = 0;

    // Exponent
    let exponent = 0n;
    // loop index over array
    let i = 0;

    // Read index
    let index = 0;

    // Naively prevent against REDOS attacks.
    // TODO: implementing a custom parsing for this, or refactoring the regex would yield
    //       further gains.
    if (representation.length >= 7000) {
        throw new Error(`${representation} not a valid Decimal128 string`);
    }

    // Results
    const stringMatch = representation.match(PARSE_STRING_REGEXP);
    const infMatch = representation.match(PARSE_INF_REGEXP);
    const nanMatch = representation.match(PARSE_NAN_REGEXP);

    // Validate the string
    if ((!stringMatch && !infMatch && !nanMatch) || representation.length === 0) {
        throw new Error(`${representation} not a valid Decimal128 string`);
    }

    if (stringMatch) {
        // full_match = stringMatch[0]
        // sign = stringMatch[1]

        const unsignedNumber = stringMatch[2];
        // stringMatch[3] is undefined if a whole number (ex "1", 12")
        // but defined if a number w/ decimal in it (ex "1.0, 12.2")

        const e = stringMatch[4];
        const expSign = stringMatch[5];
        const expNumber = stringMatch[6];

        // they provided e, but didn't give an exponent number. for ex "1e"
        if (e && expNumber === undefined) invalidErr(representation, 'missing exponent power');

        // they provided e, but didn't give a number before it. for ex "e1"
        if (e && unsignedNumber === undefined) invalidErr(representation, 'missing exponent base');

        if (e === undefined && (expSign || expNumber)) {
            invalidErr(representation, 'missing e before exponent');
        }
    }

    // Get the negative or positive sign
    if (representation[index] === '+' || representation[index] === '-') {
        isNegative = representation[index++] === '-';
    }

    // Check if user passed Infinity or NaN
    if (!isDigit(representation[index]) && representation[index] !== '.') {
        if (representation[index] === 'i' || representation[index] === 'I') {
            return isNegative ? INF_NEGATIVE_BUFFER : INF_POSITIVE_BUFFER;
        } else if (representation[index] === 'N') {
            return NAN_BUFFER;
        }
    }

    // Read all the digits
    while (isDigit(representation[index]) || representation[index] === '.') {
        if (representation[index] === '.') {
            if (sawRadix) invalidErr(representation, 'contains multiple periods');

            sawRadix = true;
            index = index + 1;
            continue;
        }

        if (nDigitsStored < 34) {
            if (representation[index] !== '0' || foundNonZero) {
                if (!foundNonZero) {
                    firstNonZero = nDigitsRead;
                }

                foundNonZero = true;

                // Only store 34 digits
                digits[digitsInsert++] = parseDigit(representation[index]);
                nDigitsStored = nDigitsStored + 1;
            }
        }

        if (foundNonZero) nDigits = nDigits + 1;
        if (sawRadix) radixPosition = radixPosition + 1n;

        nDigitsRead = nDigitsRead + 1;
        index = index + 1;
    }

    if (sawRadix && !nDigitsRead)
        throw new Error('' + representation + ' not a valid Decimal128 string');

    // Read exponent if exists
    if (representation[index] === 'e' || representation[index] === 'E') {
        // Read exponent digits
        const match = representation.substring(++index).match(EXPONENT_REGEX);

        // No digits read
        if (!match || !match[2]) return NAN_BUFFER;

        // Get exponent
        exponent = BigInt(Number.parseInt(match[0], 10));

        // Adjust the index
        index = index + match[0].length;
    }

    // Return not a number
    if (representation[index]) return NAN_BUFFER;

    // Done reading input
    // Find first non-zero digit in digits
    firstDigit = 0;

    if (!nDigitsStored) {
        firstDigit = 0;
        lastDigit = 0;
        digits[0] = 0;
        nDigits = 1;
        nDigitsStored = 1;
        significantDigits = 0;
    } else {
        lastDigit = nDigitsStored - 1;
        significantDigits = nDigits;
        if (significantDigits !== 1) {
            while (digits[firstNonZero + significantDigits - 1] === 0) {
                significantDigits = significantDigits - 1;
            }
        }
    }

    // Normalization of exponent
    // Correct exponent based on radix position, and shift significand as needed
    // to represent user input

    // Overflow prevention
    if (exponent <= radixPosition && radixPosition - exponent > 1 << 14) {
        exponent = EXPONENT_MIN;
    } else {
        exponent = exponent - radixPosition;
    }

    // Attempt to normalize the exponent
    while (exponent > EXPONENT_MAX) {
        // Shift exponent to significand and decrease
        lastDigit = lastDigit + 1;

        if (lastDigit - firstDigit > MAX_DIGITS) {
            // Check if we have a zero then just hard clamp, otherwise fail
            const digitsString = digits.join('');
            if (digitsString.match(/^0+$/)) {
                exponent = EXPONENT_MAX;
                break;
            }

            invalidErr(representation, 'overflow');
        }
        exponent = exponent - 1n;
    }

    while (exponent < EXPONENT_MIN || nDigitsStored < nDigits) {
        // Shift last digit. can only do this if < significant digits than # stored.
        if (lastDigit === 0 && significantDigits < nDigitsStored) {
            exponent = EXPONENT_MIN;
            significantDigits = 0;
            break;
        }

        if (nDigitsStored < nDigits) {
            // adjust to match digits not stored
            nDigits = nDigits - 1;
        } else {
            // adjust to round
            lastDigit = lastDigit - 1;
        }

        if (exponent < EXPONENT_MAX) {
            exponent = exponent + 1n;
        } else {
            // Check if we have a zero then just hard clamp, otherwise fail
            const digitsString = digits.join('');
            if (digitsString.match(/^0+$/)) {
                exponent = EXPONENT_MAX;
                break;
            }
            invalidErr(representation, 'overflow');
        }
    }

    // Round
    // We've normalized the exponent, but might still need to round.
    if (lastDigit - firstDigit + 1 < significantDigits) {
        let endOfString = nDigitsRead;

        // If we have seen a radix point, 'string' is 1 longer than we have
        // documented with ndigits_read, so inc the position of the first nonzero
        // digit and the position that digits are read to.
        if (sawRadix) {
            firstNonZero = firstNonZero + 1;
            endOfString = endOfString + 1;
        }
        // if negative, we need to increment again to account for - sign at start.
        if (isNegative) {
            firstNonZero = firstNonZero + 1;
            endOfString = endOfString + 1;
        }

        const roundDigit = parseDigit(representation[firstNonZero + lastDigit + 1]);
        let roundBit = 0;

        if (roundDigit >= 5) {
            roundBit = 1;
            if (roundDigit === 5) {
                roundBit = digits[lastDigit] % 2 === 1 ? 1 : 0;
                for (i = firstNonZero + lastDigit + 2; i < endOfString; i++) {
                    if (parseDigit(representation[i])) {
                        roundBit = 1;
                        break;
                    }
                }
            }
        }

        if (roundBit) {
            let dIdx = lastDigit;

            for (; dIdx >= 0; dIdx--) {
                if (++digits[dIdx] > 9) {
                    digits[dIdx] = 0;

                    // overflowed most significant digit
                    if (dIdx === 0) {
                        if (exponent < EXPONENT_MAX) {
                            exponent = exponent + 1n;
                            digits[dIdx] = 1;
                        } else {
                            return isNegative ? INF_NEGATIVE_BUFFER : INF_POSITIVE_BUFFER
                        }
                    }
                }
            }
        }
    }

    // Encode significand
    // The 34 digits of the significand
    let significand = 0n

    const digitsAsBigInt = digits.map(n => BigInt(n))

    if (significantDigits !== 0) {
        significand = digitsAsBigInt[firstDigit]
        for (let digitIndex = firstDigit + 1; digitIndex <= lastDigit; digitIndex++) {
            let digit = digitsAsBigInt[digitIndex];
            significand *= 10n
            significand += digit
        }
    }

    // Biased exponent
    const biasedExponent = exponent + EXPONENT_BIAS;
    let dec = 0n

    // Encode combination, exponent, and significand.
    if (((significand >> 113n) & 1n) === 1n) {
        // Encode '11' into bits 1 to 3
        dec |= 0b11n << 125n
        dec |= (biasedExponent & 0x3FFFn) << 111n
        dec |= significand & 0x7FFF_FFFF_FFFF_FFFF_FFFF_FFFF_FFFF_FFFFn;
    } else {
        dec |= (biasedExponent & 0x3FFFn) << 113n
        dec |= significand & 0x1FFF_FFFF_FFFF_FFFF_FFFF_FFFF_FFFF_FFFFn;
    }

    // Encode sign
    if (isNegative) {
        dec |= 0x8000_0000_0000_0000_0000_0000_0000_0000n
    }

    // Encode into a buffer
    const buffer = new ArrayBuffer(16);
    const dv = new DataView(buffer)

    dv.setBigUint64(0, dec & 0xFFFF_FFFF_FFFF_FFFF_FFFFn, true)
    dv.setBigUint64(8, dec >> 64n, true)

    return new Uint8Array(buffer)
}

function u128(bytes: Uint8Array) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const lo64 = dv.getBigUint64(0, true)
    const hi64 = dv.getBigUint64(8, true)
    return hi64 << 64n | lo64
}

export const D128 = { fromString, toString, u128 }
