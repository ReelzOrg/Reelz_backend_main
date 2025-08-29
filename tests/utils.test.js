import { verifyEmail } from "../utils.js";

test("verifies the emails", () => {
  expect(verifyEmail("virajdoshi123@gmail.com")).toBe(true);
  expect(verifyEmail("virajdoshi123@gmail")).toBe(false);
  expect(verifyEmail("")).toBe(false);
  expect(verifyEmail(null)).toBe(false);
  expect(verifyEmail(undefined)).toBe(false);
  expect(verifyEmail(123)).toBe(false);
  expect(verifyEmail(true)).toBe(false);
  expect(verifyEmail("@gmail.com")).toBe(false);
});