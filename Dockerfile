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

# Expondoidaan portti (server.ts kuuntelee porttia 3333)
EXPOSE 3333

# Käynnistetään dev-server
CMD ["bun", "run", "dev", "--host", "0.0.0.0"]
