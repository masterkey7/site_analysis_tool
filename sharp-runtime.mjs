import {createRequire} from 'node:module';
const local=createRequire(import.meta.url);
export function loadSharp(){return local('sharp');}
