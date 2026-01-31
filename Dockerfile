# Use minimal Node.js Alpine image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .

# Create a non-root user for extra security
RUN addgroup -S asip && adduser -S asip -G asip
USER asip

# Environment variables should be passed at runtime
ENV ROLE=PEER

# Start the peer
CMD [ "node", "peer.js" ]
