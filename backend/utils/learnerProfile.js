const schoolYears = ["1ere", "2eme", "3eme", "bac", "other"];
const schoolSections = ["lettres", "mathematiques", "informatique", "sciences", "technique", "economie", "other"];

export function normalizeTunisianPhone(phone) {
  let digits = typeof phone === "string" ? phone.replace(/\D/g, "") : "";
  if (digits.length === 13 && digits.startsWith("00216")) digits = digits.slice(5);
  else if (digits.length === 11 && digits.startsWith("216")) digits = digits.slice(3);
  return digits;
}

export function validateLearnerProfile({ phone, userClass, userBranch }, required = true) {
  if ((required || phone) && !/^[24579][0-9]{7}$/.test(normalizeTunisianPhone(phone))) {
    return "Indique un numéro tunisien valide de 8 chiffres.";
  }
  if ((required || userClass) && !schoolYears.includes(userClass)) return "Choisis une année scolaire valide.";
  if ((required || userBranch) && !schoolSections.includes(userBranch)) return "Choisis une section valide.";
  return null;
}
