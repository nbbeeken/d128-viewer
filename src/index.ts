import { addCorpusExamples } from './examples/corpus';
import { d128Info } from './util';

let numberInputEl: HTMLInputElement
let binEl: HTMLLIElement
let hexEl: HTMLLIElement
let decEl: HTMLLIElement
let errorEl: HTMLParagraphElement

function onNumberChange() {
    const inputString = numberInputEl.value

    const { bin, hex, dec, error } = d128Info(inputString === '' ? '0' : inputString)

    errorEl.innerHTML = error
    binEl.innerText = bin
    hexEl.innerText = hex
    decEl.innerText = dec
}

export async function main() {
    numberInputEl = document.getElementById('numberInput') as HTMLInputElement
    numberInputEl.addEventListener('input', onNumberChange)

    binEl = document.getElementById('currentNumberBin') as HTMLLIElement
    hexEl = document.getElementById('currentNumberHex') as HTMLLIElement
    decEl = document.getElementById('currentNumberDec') as HTMLLIElement
    errorEl = document.getElementById('error') as HTMLParagraphElement

    onNumberChange()

    addCorpusExamples()
}

window.addEventListener('DOMContentLoaded', main)
