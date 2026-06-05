# Deploy Android APK

Builds the Android APK via EAS and installs it on the connected device via ADB.

## Steps

1. Check for any TypeScript errors in the codebase with `npx tsc --noEmit`.

2. If there are errors, fix them before continuing.

3. Commit and push all changes to `claude/top-golf-app-design-ut5ly`:
   - `git add -A`
   - `git commit -m "fix: <describe what changed>"`
   - `git push -u origin claude/top-golf-app-design-ut5ly`

4. Trigger an EAS build:
   ```
   eas build --platform android --profile preview --non-interactive
   ```

5. Wait for the build to complete, then get the download URL from the output.

6. Download and install via ADB:
   ```
   curl -L "<build_url>" -o GolfCaddie.apk && adb install -r GolfCaddie.apk
   ```

7. Confirm the app launched successfully on the device.

## Common failures and fixes

| Error | Fix |
|-------|-----|
| `babel-preset-expo` not found | Add `babel-preset-expo` to devDependencies in package.json |
| `adaptive-icon.png` missing | Copy an existing PNG to `assets/adaptive-icon.png` |
| App crashes on launch | Check `eas.json` has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the `preview.env` block |
| Package version mismatch | Pin packages to exact versions from `https://raw.githubusercontent.com/expo/expo/sdk-56/packages/expo/bundledNativeModules.json` |
| `adb: device unauthorized` | Check phone for "Allow USB debugging?" popup and tap Allow |
| App not installed (sideload) | Use `adb install -r` instead of manually copying the APK |
