# Releasing

1. Update the version in `package.json` and `android/build.gradle`. The iOS podspec reads its version from `package.json`.
2. Add a version heading such as `## 0.1.2` to [CHANGELOG.md](../CHANGELOG.md) with the release notes.
3. Run `pnpm verify` and commit the changes. Create a stable annotated tag matching the package version and push it with the branch.

```sh
git tag -a v0.1.2 -m "Release v0.1.2"
git push --atomic origin main v0.1.2
```

The [GitHub release workflow](../.github/workflows/release.yml) verifies the tagged build and creates the release from the changelog. A tag without a matching changelog heading uses GitHub’s generated notes.

## Enable publishing to npm

Publish the first package version directly with an npm account that can claim the package name. Run `pnpm login` and `pnpm publish --access public` from the version you want to publish. npm requires an existing package before you can configure trusted publishing. [npm trusted publishing prerequisites](https://docs.npmjs.com/cli/commands/npm-trust/)

In the package’s npm settings, add GitHub Actions as a trusted publisher. Use owner `andwati`, repository `expo-app-updates-android-ios`, and workflow filename `release.yml`. Enable direct publishing and leave the environment name empty. [npm trusted publishing setup](https://docs.npmjs.com/trusted-publishers/)

Enable the publish job by setting this GitHub Actions variable. Trusted publishing uses GitHub’s short-lived OIDC credentials, so no repository secret is required.

```sh
gh variable set NPM_PUBLISH_ENABLED --body true --repo andwati/expo-app-updates-android-ios
```

The workflow publishes after it creates a release from a tag. It also handles releases published from the GitHub UI or CLI. To run it again for an existing tagged release, use:

```sh
gh workflow run release.yml --ref main -f tag=v0.1.2
```
