import { D128 } from './d128.ts';

const binDigits = (bytes: Uint8Array) => D128.u128(bytes).toString(2).padStart(128, '0')
const hexDigits = (bytes: Uint8Array) => D128.u128(bytes).toString(16).padStart(16, '0')
const splitInto = (sections: number, input: string) =>
    input
        .split(new RegExp(String.raw`([0-9a-fA-F]{${sections}})`))
        .filter((section: string) => section.length === sections)
        .join('_')

export function d128Info(inputString) {
    let bin = '😭'
    let hex = '😭'
    let dec = '😭'

    let error = ''

    let bytes: Uint8Array
    let representation: string

    try {
        bytes = D128.fromString(inputString)
    } catch (e) {
        error = `fromString - ${e}`
        return { bin, hex, dec, error }
    }

    try {
        representation = D128.toString(bytes)
    } catch (e) {
        error = `toString - ${e}`
        return { bin, hex, dec, error }
    }

    bin = `0b${splitInto(16, binDigits(bytes))}`
    hex = `0x${splitInto(8, hexDigits(bytes))}`
    dec = representation

    return { bin, hex, dec, error }
}
