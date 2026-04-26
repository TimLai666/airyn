import { BrowserWindow } from "electrobun/bun";

const mainWindow = new BrowserWindow({
  title: "Airyn Ground",
  url: "views://mainview/index.html",
  frame: {
    width: 1180,
    height: 780,
    x: 160,
    y: 120
  }
});

mainWindow.focus();

console.log("Airyn Ground started");
