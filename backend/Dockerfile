# ── Imagen base: Node.js 20 ligero (Alpine Linux) ──────────────────────────────
FROM node:20-alpine

# Herramientas necesarias para bcrypt (compilación nativa)
RUN apk add --no-cache python3 make g++

# Carpeta de trabajo dentro del contenedor
WORKDIR /app

# Copiar dependencias primero (caché de Docker — si no cambia package.json no reinstala)
COPY package*.json ./
RUN npm install --omit=dev

# Copiar el resto del código
COPY . .

# Puerto que expone el backend (debe coincidir con tu .env / server.js)
EXPOSE 4000

# Comando para iniciar el servidor
CMD ["node", "src/server.js"]
