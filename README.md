# ODC API

For a quick start,

`npm install`

`npm run build`
`npm run start`
Check if it's healthy:

`http://localhost:5000/api/1/info`

To build a standalone server file,
make sure you have ncc installed:

`npm i -g @vercel/ncc`

and then execute:

`npm run compile`

Server got compiled into single file, and located in compiled/index.js

To check if everything OK with compiled server file, execute:

`npm run start-compiled`

And double-check if it's healthy:

`http://localhost:5000/api/1/info`
