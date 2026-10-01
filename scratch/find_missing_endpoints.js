const fs = require('fs');
const path = require('path');

const endpoints = JSON.parse(fs.readFileSync('endpoints.json', 'utf8'));
const srcPath = path.join(__dirname, '../client/src');

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function(file) {
    if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
      arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles);
    } else {
      if (file.endsWith('.js') || file.endsWith('.jsx')) {
        arrayOfFiles.push(path.join(dirPath, file));
      }
    }
  });
  return arrayOfFiles;
}

const files = getAllFiles(srcPath);
let content = '';
files.forEach(file => {
  content += fs.readFileSync(file, 'utf8') + '\n';
});

const crudMatches = [...content.matchAll(/createCrudApi\('([^']+)'\)/g)].map(m => m[1]);

const implemented = new Set();
// A crude way to see if an endpoint is implemented is to see if its path or parts of its path exist in the code
// But better: we know exact strings used in axios or createCrudApi.
endpoints.forEach(ep => {
  const [method, url] = ep.split(' ');
  // Check if it's covered by createCrudApi
  const isCrud = crudMatches.some(base => {
    if (url === base && ['GET', 'POST'].includes(method)) return true;
    if (url === `${base}/{id}` && ['GET', 'PUT', 'DELETE'].includes(method)) return true;
    return false;
  });
  if (isCrud) {
    implemented.add(ep);
    return;
  }
  
  // Convert `{id}` to `${id}` or something similar for checking
  // We can just check if the literal string is in the code
  const urlRegex = url.replace(/{[^}]+}/g, '.*');
  // Just look for the URL path in the content
  // E.g. `/stable/tasks/${id}/incident` -> contains `/stable/tasks/`
  // We can just strip {something} and see if the rest of the string is present
  const baseParts = url.split('/').filter(p => !p.startsWith('{')).join('/');
  
  if (content.includes(baseParts)) {
    // This is a rough check. Let's do a better one.
    // If the exact endpoint path (replacing {param} with ${param}) is found.
    const templatedUrl = url.replace(/{([^}]+)}/g, '\\$\\{.*\\}');
    const regex = new RegExp(templatedUrl);
    if (regex.test(content)) {
       implemented.add(ep);
    } else if (content.includes(url.replace(/{([^}]+)}/g, ''))) {
       // if we just removed the params, see if it exists
       // e.g. /users/approval
    }
  }
});

console.log("== Implemented (Roughly) ==");
endpoints.filter(ep => implemented.has(ep)).forEach(ep => console.log(ep));

console.log("\n== Missing ==");
endpoints.filter(ep => !implemented.has(ep)).forEach(ep => console.log(ep));
