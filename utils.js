export function verifyEmail(email) {
  const regex = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

  return regex.test(String(email).toLowerCase()); 
}

console.success = (message) => {
  const greenColor = "\x1b[32m"; // ANSI code for green
  const resetColor = "\x1b[0m";  // ANSI code to reset color
  console.log(greenColor + message + resetColor);
}