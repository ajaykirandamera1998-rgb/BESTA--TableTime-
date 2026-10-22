// Inside the kiosk the policies open in a frame; hide links that would leave the kiosk.
if (window.top !== window.self) document.documentElement.classList.add('framed');
