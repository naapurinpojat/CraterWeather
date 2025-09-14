# Käytetään Bunin virallista kuvaa
FROM oven/bun:1-alpine

# Työhakemisto
WORKDIR /app

# Kopioidaan riippuvuustiedostot ensin (jos käytössä)
#COPY bun.lockb package.json ./

# Asennetaan riippuvuudet
RUN bun install || true

# Kopioidaan lähdekoodi
COPY . .

# Expondoidaan portti (Vite / Bun dev server käyttää oletuksena 5173)
EXPOSE 5173

# Käynnistetään dev-server
CMD ["bun", "run", "dev", "--host", "0.0.0.0"]
