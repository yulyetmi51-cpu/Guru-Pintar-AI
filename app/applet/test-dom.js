import { DOMParser } from 'xmldom';

const parser = new DOMParser();
const doc = parser.parseFromString('<@w>hello</@w>', 'text/html');
console.log(doc.documentElement.nodeName);
