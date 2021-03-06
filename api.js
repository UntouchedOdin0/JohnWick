const fetch = require('node-fetch');
const fs = require('fs');
const querystring = require('querystring');
const { FortniteToken } = require('./tokens');

const OAUTH_TOKEN = "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token";
const OAUTH_EXCHANGE = "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/exchange";
const LAUNCHER_LOGIN = "https://accounts.launcher-website-prod07.ol.epicgames.com/login/doLauncherLogin";
const LAUNCHER_WAIT = "https://accounts.launcher-website-prod07.ol.epicgames.com/login/showPleaseWait";
const FORTNITE_STORE = "https://fortnite-public-service-prod11.ol.epicgames.com/fortnite/api/storefront/v2/catalog";

function getClientCredentials() {
    return fetch(OAUTH_TOKEN, {
        method: "POST",
        headers: {
            'Authorization': "basic " + FortniteToken[2],
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: querystring.stringify({
            grant_type: "client_credentials",
            token_token: "eg1",
        }),
    }).then(r => r.json());
}

function headersToCookies(headers) {
    return headers.raw()['set-cookie'].map(v => v.split(";").shift().split("="));
}

function cookiesToString(cookies) {
    return cookies.map(v => v[0] + "=" + v[1]).join("; ");
}

function getXsrfToken(client_credentials) {
    let params = {
        client_id: client_credentials.client_id,
        redirectUrl: LAUNCHER_WAIT + "?" + querystring.stringify({client_id: client_credentials.client_id, rememberEmail: false}),
    };
    return fetch(LAUNCHER_LOGIN + "?" + querystring.stringify(params), {
        method: "GET",
    }).then(r => r.headers);
}

async function getExchangeCode(client_credentials, cookies) {
    let xsrfCookie = cookies.filter(v => v[0] == 'XSRF-TOKEN').pop()[1];
    let cookieString = cookiesToString(cookies);
    let redirectUrl = LAUNCHER_WAIT + "?" + querystring.stringify({client_id: client_credentials.client_id, rememberEmail: false});
    let redirectData = await fetch(LAUNCHER_LOGIN, {
        method: "POST",
        headers: {
            "Cookie": cookieString,
            "X-XSRF-TOKEN": xsrfCookie,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: querystring.stringify({
            fromForm: "yes",
            authType: '',
            linkExtAuth: '',
            client_id: client_credentials.client_id,
            redirectUrl: redirectUrl,
            epic_username: FortniteToken[0],
            password: FortniteToken[1],
            rememberMe: "NO",
        }),
    });
    let cookies2 = headersToCookies(redirectData.headers);

    let tokenRequest = await fetch(redirectUrl, {
        method: "GET",
        headers: {
            "Cookie": cookiesToString(cookies2),
            "X-XSRF-TOKEN": xsrfCookie,
        },
    }).then(r => r.text());
    let tokenData = await tokenRequest.text();
    let exchangeToken = tokenData.match(/com\.epicgames\.account\.web\.widgets\.loginWithExchangeCode\('([\w]+)')/g).pop();

    return exchangeToken;
}

function getAccessToken() {
    if (!FortniteToken) {
        console.error("Credentials not found");
        return false;
    }
    var loginData = {
        "grant_type": "password",
        "username": FortniteToken[0],
        "password": FortniteToken[1],
        "includePerms": 'true',
    };
    return fetch(OAUTH_TOKEN, {
        method: "POST",
        headers: {
            'Authorization': "basic " + FortniteToken[2],
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: querystring.stringify(loginData),
    }).then(r => r.json()).then(r => {
        return r.access_token;
    }).catch(e => false);
}

function getAccessCode(access_token) {
    return fetch(OAUTH_EXCHANGE, {
        headers: {
            "Authorization": "bearer " + access_token,
        },
        method: "GET",
    }).then(r => r.json()).then(r => r.code);
}

function getExchangeToken(code) {
    return fetch(OAUTH_TOKEN, {
        headers: {
            "Authorization": "basic " + FortniteToken[3],
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: querystring.stringify({
            grant_type: "exchange_code",
            exchange_code: code,
            includePerms: true,
            token_type: "eg1",
        }),
        method: "POST",
    }).then(r => r.json()).then(r => ({
        access_token: r.access_token,
        refresh_token: r.refresh_token,
        expires_at: r.expires_at,
        refresh_expires_at: r.refresh_expires_at,
    }));
}

function getRefreshToken(token) {
    return fetch(OAUTH_TOKEN, {
        headers: {
            "Authorization": "basic " + FortniteToken[3],
             'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: "POST",
        body: querystring.stringify({
            grant_type: "refresh_token",
            refresh_token: token.refresh_token,
            includePerms: true,
        }),
    }).then(r => r.json()).then(r => ({
        access_token: r.access_token,
        refresh_token: r.refresh_token,
        expires_at: r.expires_at,
        refresh_expires_at: r.refresh_expires_at,
    }));
}

function refreshToken(token) {
    if (!token) return getLoginToken();
    let refreshExpire = new Date(token.refresh_expires_at);
    if (Date.now() > refreshExpire) return getLoginToken();
    let accessExpire = new Date(token.expires_at);
    if (Date.now() > accessExpire) return getRefreshToken(token);
    return token;
}

async function getLoginToken() {
    let launcherToken = await getAccessToken();
    let accessCode = await getAccessCode(launcherToken);
    let params = await getExchangeToken(accessCode);
    return params;
}

let loginToken = false;

async function getStoreData() {
    loginToken = await refreshToken(loginToken);
    return fetch(FORTNITE_STORE, {
        headers: {
            "X-EpicGames-Language": "en",
            "Authorization": "bearer " + loginToken.access_token,
        },
        method: "GET",
    }).then(r => r.json());
}

exports.getStoreData = getStoreData;
