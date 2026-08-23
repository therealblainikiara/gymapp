/**
 * The disclaimer prose, verbatim from `Gym App v2.dc.html`.
 *
 * PENDING LEGAL REVIEW (C5). Any edit to the words below must come with a bump
 * to DISCLAIMER_VERSION in lib/disclaimer.ts, otherwise users who accepted the
 * old wording are recorded as having accepted the new one.
 */
export function DisclaimerText() {
  return (
    <div
      style={{
        maxHeight: 260,
        overflow: "auto",
        border: "1px solid var(--color-divider)",
        padding: 14,
        fontSize: 13,
        lineHeight: 1.6,
      }}
      tabIndex={0}
      aria-label="Health and liability disclaimer"
    >
      <p>
        <strong>Read carefully — use of this app is at your own risk.</strong>
      </p>
      <p>
        Gym App provides general fitness and nutrition information for
        educational purposes only. It is <strong>not medical advice</strong>,
        and it is not a substitute for consultation with a qualified physician,
        physiotherapist, or registered dietitian.
      </p>
      <p>
        <strong>1. Consult a professional first.</strong> Before beginning this
        or any exercise or nutrition programme — especially if you are over 40,
        have an injury, a heart condition, high blood pressure, diabetes, are
        pregnant, or have any other medical condition — consult your doctor.
      </p>
      <p>
        <strong>2. Assumption of risk.</strong> Physical exercise carries
        inherent risk of injury, including serious injury or death. By using
        this app you voluntarily accept and assume all such risk, and all
        responsibility for your own health, safety, technique, equipment and
        surroundings.
      </p>
      <p>
        <strong>3. No liability.</strong> To the maximum extent permitted by
        law, the designer, developer and publisher of this app accept no
        liability whatsoever for any injury, illness, allergic reaction, loss or
        damage of any kind, direct or indirect, arising from or connected to
        your use of this app, its workout plans, meal suggestions or camera
        feedback.
      </p>
      <p>
        <strong>4. Dietary information.</strong> Meal suggestions and dietary
        tags (including lactose-free, gluten-free and nut-free labels) are
        indicative only. Always check ingredient labels yourself. If you have an
        allergy or intolerance, you are solely responsible for verifying every
        food is safe for you.
      </p>
      <p>
        <strong>5. Simulated feedback.</strong> Rep counting, form feedback and
        device readings in this prototype are simulated and must not be relied
        upon for safety decisions.
      </p>
      <p>
        <strong>6. Stop if unwell.</strong> Stop exercising immediately and seek
        medical attention if you feel pain, dizziness, chest discomfort or
        shortness of breath.
      </p>
      <p>
        By continuing you confirm you have read, understood and accept these
        terms in full, and release the app designer from any and all claims.
      </p>
    </div>
  );
}
