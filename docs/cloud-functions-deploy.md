# Cloud Functions Deploy Checklist

This project now treats the regular reservation core as server-only when Firebase is enabled.

Required deployed functions:

- `submitRegularApplication`
- `cancelApplication`
- `transitionApplicationStatus`
- `approvePendingUser`
- `notifySlackOnSignupRequestCreated`
- `runApplicationMaintenance`
- `scheduledApplicationMaintenance`

## Firebase project aliases

This repository uses the following aliases in [.firebaserc](/Users/mysc/Desktop/startup-diagnostic-platform/.firebaserc):

- `stage` -> `startup-diagnosis-platform`
- `live` -> `startup-acceleration-platform`

## Before first deploy

1. Create or choose the target Firebase project.
2. Make sure billing is enabled for the project.
3. Log in to Firebase CLI.
4. Make sure both projects have required secrets configured independently.

Example:

```bash
firebase functions:secrets:set GEMINI_API_KEY --project startup-diagnosis-platform
firebase functions:secrets:set GEMINI_API_KEY --project startup-acceleration-platform
firebase functions:secrets:set SLACK_SIGNUP_REQUEST_WEBHOOK_URL --project startup-diagnosis-platform
firebase functions:secrets:set SLACK_SIGNUP_REQUEST_WEBHOOK_URL --project startup-acceleration-platform
```

## Deploy commands

Deploy all functions to `stage`:

```bash
npm run deploy:stage:functions
```

Deploy all functions to `live`:

```bash
npm run deploy:live:functions
```

Deploy all functions to both projects:

```bash
npm run deploy:both:functions
```

Deploy only the reservation core to both projects:

```bash
npm run deploy:both:core
```

Deploy only the Gemini report function to both projects:

```bash
npm run deploy:both:report
```

Deploy Firestore and Storage rules to both projects:

```bash
npm run deploy:both:rules
```

Deploy office-hour core + report function + rules to both projects:

```bash
npm run deploy:both:app
```

## Runtime expectations

- Functions region defaults to `asia-northeast3`.
- Frontend Firebase config must point to the same Firebase project as the deployed functions.
- In Firebase mode, regular reservation submit/cancel/transition and user approval now fail closed if functions are unavailable.

## Recommended first-deploy smoke test

1. Admin approves one pending company account.
2. Company submits one regular reservation.
3. Consultant claims and confirms the reservation.
4. Company cancels a separate pending reservation.
5. Verify `officeHourApplications` and `officeHourSlots` changed together.
