export default function checkUserAuthorization(req, res, next) {
  const loggedInUserId = req.user.userId;
  const apiID = req.params.id;
  console.log("The user ids are:", loggedInUserId, apiID);

  if(loggedInUserId != apiID) {
    return res.json({ success: false, message: "You are not authorized to perform this action" })
  }
  next();
}