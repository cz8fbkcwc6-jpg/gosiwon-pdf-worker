FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

# 루트의 모든 js 파일과 fonts 디렉토리 복사
COPY index.js buildHtml.js ./
COPY fonts ./fonts

ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
