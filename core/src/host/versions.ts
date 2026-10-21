/**
 * A published version: a release number, or a pre-release of one (`-alpha.N`, `-beta.N`, `-rc.N`) — the versions a
 * tag publishes images for (.github/workflows/publish-images.yml). Anything else, such as `dev`, is a build made on a
 * machine. The images' Dockerfiles and the host service's and Fleet Console's build scripts check the same form,
 * which a host test holds to this one.
 */
export const PUBLISHED_VERSION = /^\d+\.\d+\.\d+(-(alpha|beta|rc)\.\d+)?$/

export const isPublishedVersion = (version: string): boolean => PUBLISHED_VERSION.test(version)
