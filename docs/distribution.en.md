# Data, credentials, and distribution boundaries

[简体中文](distribution.md) | English

This skill packages the local product and agent workflow. It grants no additional rights to third-party maps, imagery, or reference materials, and does not choose an open-source license for the product owner. Selling, open-source publication, and public deployment require separate decisions by the owner.

- No public open-source license was assigned to the original application during packaging. Do not add MIT or GPL to the entire product merely to upload it to GitHub.
- vendor/ retains the original coordtransform and html2canvas licenses. Install npm dependencies through the standard package manager and retain their licenses; sharp's binary dependencies have their own notices.
- Bundled Hangzhou vector data and rendered images reproduce the existing basemap for regression checks. Keep OSM/OpenMapTiles attribution. Database and derived data remain subject to applicable terms such as ODbL. Do not remove attribution from pages, videos, or exports.
- Regression fixtures contain Hangzhou and Liangzhu place samples, not real user projects. They still include third-party data; review the applicable data rights before public distribution.
- The AMap JS SDK is loaded from the provider. Satellite imagery is not bundled. Live search, queries, and imagery require a network connection and the user's own authorized credentials.
- Using a personal key, running locally, or calling the package a “skill” does not by itself resolve commercial authorization or public map-service requirements. Recheck official terms before charging or publishing; do not rely on old prices.
- Exclude .local, .env files, node_modules, temporary downloads, dynamic tile caches, personal projects, reference PDFs, chat history, and AI-generated visual mockups. Do not extract credentials from these files for another person to reuse.

Official references to consult when reviewing distribution:

- https://developer.amap.com/pages/authorization/
- https://developer.amap.com/upgrade
- https://openfreemap.org/
- https://www.openstreetmap.org/copyright

The current product targets local reproduction and video demonstrations. The package has not been accepted as a public deployment with multi-user operation, security, billing, and operational support.
