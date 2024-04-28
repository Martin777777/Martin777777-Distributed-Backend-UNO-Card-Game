# vite build
FROM library/node:18-alpine as node
WORKDIR /home/node/app
COPY *.js* ./
RUN npm i
COPY *.ts ./
COPY index.html ./
COPY src ./src
RUN ls -al && npm run build

# nginx
FROM library/nginx:alpine
COPY --from=node /home/node/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf