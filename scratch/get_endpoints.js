const fs = require('fs');
const https = require('https');

https.get('https://racehorse-tms-server.onrender.com/api-docs/swagger-ui-init.js', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const match = data.match(/"swaggerDoc": (\{.*\}),\n  "customOptions"/s);
      if (match) {
        const spec = JSON.parse(match[1]);
        const endpoints = [];
        for (const [path, methods] of Object.entries(spec.paths)) {
          for (const method of Object.keys(methods)) {
            endpoints.push(`${method.toUpperCase()} ${path}`);
          }
        }
        fs.writeFileSync('endpoints.json', JSON.stringify(endpoints, null, 2));
        console.log('Successfully saved to endpoints.json');
      } else {
        console.log('Could not find swaggerDoc');
      }
    } catch(err) {
      console.error(err);
    }
  });
}).on('error', err => {
  console.log(err.message);
});
