import { fileURLToPath } from "url";
import path from "path";
const currentFilename = fileURLToPath(import.meta.url);
console.log("import.meta.url:", import.meta.url);
console.log("currentFilename:", currentFilename);
console.log("dirname:", path.dirname(currentFilename));
