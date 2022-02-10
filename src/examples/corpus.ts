import { D128 } from '../d128.ts';
import { d128Info } from '../util.ts';
import d128_1 from './decimal128-1.json'
import d128_2 from './decimal128-2.json'
import d128_3 from './decimal128-3.json'
import d128_4 from './decimal128-4.json'
import d128_5 from './decimal128-5.json'
// import d128_6 from './decimal128-6.json'
// import d128_7 from './decimal128-7.json'

const examples = [
    ...d128_1.valid,
    ...d128_2.valid,
    ...d128_3.valid,
    ...d128_4.valid,
    ...d128_5.valid,
]

const bytesFromHex = (hex) => {
    const bytes = []
    for (let i = 0; i < hex.length; i += 2) {
        const byte = hex.slice(i, i + 2)
        bytes.push(Number.parseInt(byte, 16))
    }
    return new Uint8Array(bytes)
}


const newExampleSection = ({ bin, hex, dec }) =>  {
    const ul = document.createElement('ul')

    const binEl = document.createElement('li')
    binEl.innerText = bin

    const hexEl = document.createElement('li')
    hexEl.innerText = hex

    const decEl = document.createElement('li')
    decEl.innerText = dec

    ul.appendChild(binEl)
    ul.appendChild(hexEl)
    ul.appendChild(decEl)

    return ul
}

export function addCorpusExamples() {
    const examplesList = document.getElementById('corpusExamplesList')

    for (const example of examples) {
        const bytes = bytesFromHex(example.canonical_bson).subarray(7, 23)
        const representation = D128.toString(bytes)

        const ex = document.createElement('li')
        const exName = document.createElement('span')
        exName.classList.add('exampleName')
        exName.innerText = example.description
        ex.appendChild(exName)
        ex.appendChild(newExampleSection(d128Info(representation)))
        examplesList.appendChild(ex)
    }
}
