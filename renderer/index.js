const loginButton = document.getElementById('login-button');
const dataP = document.getElementById('data');
const list = document.getElementById('list');

const { ipcRenderer } = require('electron');

let token
let proxyUser;
let proxyPass;
let proxyUrl;


async function getProxyPass() {
  try {
    const response = await fetch('https://api.zamakowany.pl/getProxyPass', {
      headers: {
        'token': `${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching proxy pass:', error);
    return null;
  }
}
async function getAccList() {
  try {
    const response = await fetch('https://api.zamakowany.pl/getAccList', {
      headers: {
        'token': `${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching account list:', error);
    return null;
  }
}

loginButton.addEventListener('click', function () {
  const tokenInput = document.getElementById('token-input').value;
  if (tokenInput) {
    token = tokenInput;
    (async () => {
      proxyCred = await getProxyPass();
      proxyUser = proxyCred.data.proxyUser;
      proxyPass = proxyCred.data.proxyPass;
      proxyUrl = proxyCred.data.proxyUrl;
      document.getElementById('login-container').style.display = 'none';
      document.getElementById('logged-in-message').style.display = 'block';
      let accList = await getAccList();
      accList = accList.data;
      accList.forEach(element => {
        console.log(element); 
        list.innerHTML += `<tr>
          <td data-th="Nickname">${element.Nickname}</td>
          <td data-th="Proxy number">${element.proxyN}</td>
          <td data-th="Start"><button class="button" onclick="openNewProxyWindow(${element.proxyN}, '${element.Token}')">Login</button></td>
        </tr>`;
      });
    })();
  }
});

function openNewProxyWindow(n, dcToken) {
  if (!proxyUser || !proxyPass || !dcToken || !proxyUrl) {
    alert('Brak danych proxy');
    return;
  }
  dcToken = `"${dcToken}"`;
  ipcRenderer.send('open-proxy-window', { n, proxyUser, proxyPass, proxyUrl, dcToken });
}
// document.getElementById('openWindow').addEventListener('click', () => {
//   const url = document.getElementById('url').value;
//   const n = document.getElementById('n').value;

//   if (url && n) {
//     ipcRenderer.send('open-proxy-window', { url, n, proxyUser, proxyPass });
//   } else {
//     alert('Wypełnij wszystkie pola.');
//   }
// });