chrome.runtime.onInstalled.addListener(e=>{e.reason==="install"&&chrome.runtime.openOptionsPage()});
