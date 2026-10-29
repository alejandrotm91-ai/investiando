import { fileURLToPath } from "url";
import path from "path";
const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = typeof __dirname !== "undefined" ? __dirname : path.dirname(currentFilename);
console.log(currentDirname);
