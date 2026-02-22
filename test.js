const R = 0; // degrees
const W = 100;
const H = 100;
const vx = (-W / 2) * Math.cos(R) - (-H / 2) * Math.sin(R);
const vy = (-W / 2) * Math.sin(R) + (-H / 2) * Math.cos(R);
console.log(vx, vy);
