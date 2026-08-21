const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const search = `                fiftyDayAverage: fiftyDayAverage !== null ? fiftyDayAverage : (q.fiftyDayAverage || null),
                twoHundredDayAverage: twoHundredDayAverage !== null ? twoHundredDayAverage : (q.twoHundredDayAverage || null),
                fiftyDayAverage: fiftyDayAverage !== null ? fiftyDayAverage : (q.fiftyDayAverage || null),
                twoHundredDayAverage: twoHundredDayAverage !== null ? twoHundredDayAverage : (q.twoHundredDayAverage || null),`;

const replace = `                fiftyDayAverage: fiftyDayAverage !== null ? fiftyDayAverage : (q.fiftyDayAverage || null),
                twoHundredDayAverage: twoHundredDayAverage !== null ? twoHundredDayAverage : (q.twoHundredDayAverage || null),`;

code = code.replace(search, replace);
fs.writeFileSync('server.ts', code);
console.log('fixed dupes 2');
