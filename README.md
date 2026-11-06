# Ajantasa

Proactive assistant that keeps small-business information up to date across Finder, Google and the business website. Built for the Fonecta challenge at Since AI Hackathon 2026. See `DESIGN.md`.

## Run locally

```bash
cp .env.example .env.local   # fill in MONGODB_URI (Atlas) etc.
npm install
npm run dev
curl -X POST http://localhost:3000/api/seed   # or use "Reset demo data" on /
```

No Atlas yet? A local MongoDB works too:

```bash
docker run -d --name ajantasa-mongo -p 27017:27017 mongo:7
# MONGODB_URI=mongodb://localhost:27017
```
