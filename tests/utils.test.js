import { verifyEmail } from "../utils.js";

test("verifies the emails", () => {
  expect(verifyEmail("virajdoshi123@gmail.com")).toBe(true);
  expect(verifyEmail("virajdoshi123@gmail")).toBe(false);
});