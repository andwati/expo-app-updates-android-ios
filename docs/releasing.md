# Releasing

1. Update the version in `package.json` and `android/build.gradle`. The iOS podspec reads its version from `package.json`.
2. Add a version heading such as `## 0.1.2` to [CHANGELOG.md](../CHANGELOG.md) with the release notes.
3. Run `pnpm verify` and commit the changes. Create a stable annotated tag matching the package version and push it with the branch.

```sh
git tag -a v0.1.2 -m "Release v0.1.2"
git push --atomic origin main v0.1.2
```

The [GitHub release workflow](../.github/workflows/release.yml) verifies the tagged build and creates the release from the changelog. A tag without a matching changelog heading uses GitHub’s generated notes. To publish the verified version to npm, run `pnpm publish --access public` separately.
