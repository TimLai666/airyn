const clock = document.querySelector<HTMLTimeElement>("#clock");
const date = document.querySelector<HTMLSpanElement>("#date");

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function render(): void {
  const now = new Date();

  if (clock) {
    clock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  if (date) {
    date.textContent = `${now.getFullYear()}·${pad(now.getMonth() + 1)}·${pad(now.getDate())}`;
  }
}

render();
setInterval(render, 1000);
