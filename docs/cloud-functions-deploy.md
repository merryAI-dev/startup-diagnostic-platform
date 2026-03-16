# Cloud Functions Deploy Checklist

This project now treats the regular reservation core as server-only when Firebase is enabled.

Required deployed functions:

- `submitRegularApplication`
- `cancelApplication`
- `transitionApplicationStatus`
- `approvePendingUser`
- `runApplicationMaintenance`
- `scheduledApplicationMaintenance`

## Before first deploy

1. Create or choose the target Firebase project.
2. Make sure billing is enabled for the project.
3. Log in to Firebase CLI.
4. Select the target project:

```bash
firebase use --add
```

Or deploy with an explicit project id:

```bash
firebase deploy --project <project-id> --only functions
```

## Deploy commands

Deploy all functions:

```bash
npm run deploy:functions
```

Deploy only the reservation core:

```bash
npm run deploy:functions:core
```

Deploy Firestore and Storage rules:

```bash
npm run deploy:rules
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
