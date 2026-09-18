#!/bin/bash
set -euo pipefail

REPO="polarsource/cli"
DEFAULT_INSTALL_DIR="${HOME}/.local/bin"
INSTALL_DIR="${INSTALL_DIR:-}"
BINARY_NAME="polar"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

info() { echo -e "${BOLD}${GREEN}==>${NC} ${BOLD}$1${NC}"; }
warn() { echo -e "${YELLOW}warning:${NC} $1"; }
error() { echo -e "${RED}error:${NC} $1" >&2; exit 1; }

detect_platform() {
  local os arch

  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *)      error "Unsupported OS: $os" ;;
  esac

  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)             error "Unsupported architecture: $arch" ;;
  esac

  if [ "$os" = "linux" ] && [ "$arch" = "arm64" ]; then
    error "Linux arm64 is not yet supported"
  fi

  echo "${os}-${arch}"
}

get_latest_version() {
  local version
  version=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
  if [ -z "$version" ]; then
    error "Failed to determine latest version"
  fi
  echo "$version"
}

get_archive_name() {
  local platform="$1"

  case "$platform" in
    darwin-*) echo "${BINARY_NAME}-${platform}.zip" ;;
    *) echo "${BINARY_NAME}-${platform}.tar.gz" ;;
  esac
}

resolve_install_dir() {
  if [ -n "$INSTALL_DIR" ]; then
    echo "$INSTALL_DIR"
    return
  fi

  local current_binary
  current_binary="$(type -P "$BINARY_NAME" || true)"
  if [ -n "$current_binary" ]; then
    dirname "$current_binary"
    return
  fi

  echo "$DEFAULT_INSTALL_DIR"
}

check_path() {
  local install_dir="$1"
  local shell_name

  case ":${PATH}:" in
    *":${install_dir}:"*) ;;
    *)
      warn "${install_dir} is not in your PATH."
      echo ""

      shell_name="$(basename "${SHELL:-}")"
      case "$shell_name" in
        zsh)
          echo "  Add it by running:"
          echo "    echo 'export PATH=\"${install_dir}:\$PATH\"' >> ~/.zshrc && source ~/.zshrc"
          ;;
        bash)
          echo "  Add it by running:"
          echo "    echo 'export PATH=\"${install_dir}:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
          ;;
        fish)
          echo "  Add it by running:"
          echo "    fish_add_path ${install_dir}"
          ;;
        *)
          echo "  Add ${install_dir} to your PATH to use the polar command."
          ;;
      esac
      echo ""
      ;;
  esac
}

ensure_install_dir() {
  local dir="$1"

  if [ -d "$dir" ]; then
    return
  fi

  info "Creating install directory ${dir}..."
  if mkdir -p "$dir" 2>/dev/null; then
    return
  fi

  sudo mkdir -p "$dir"
}

install_binary() {
  local source_path="$1"
  local target_dir="$2"
  local target_path="${target_dir}/${BINARY_NAME}"

  if [ -w "$target_dir" ]; then
    mv "$source_path" "$target_path"
    chmod +x "$target_path"
  else
    sudo mv "$source_path" "$target_path"
    sudo chmod +x "$target_path"
  fi
}

main() {
  local platform version url

  INSTALL_DIR="$(resolve_install_dir)"

  info "Detecting platform..."
  platform="$(detect_platform)"
  info "Platform: ${platform}"

  info "Fetching latest version..."
  version="$(get_latest_version)"
  info "Version: ${version}"

  local archive
  archive="$(get_archive_name "$platform")"
  local url="https://github.com/${REPO}/releases/download/${version}/${archive}"
  local checksums_url="https://github.com/${REPO}/releases/download/${version}/checksums.txt"

  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  info "Downloading ${BINARY_NAME} ${version}..."
  curl -fsSL "$url" -o "${tmpdir}/${archive}" || error "Download failed. Check if a release exists for your platform: ${platform}"

  info "Verifying checksum..."
  curl -fsSL "$checksums_url" -o "${tmpdir}/checksums.txt" || error "Failed to download checksums"

  local expected actual
  expected="$(grep "${archive}" "${tmpdir}/checksums.txt" | awk '{print $1}')"
  if [ -z "$expected" ]; then
    error "No checksum found for ${archive}"
  fi

  if command -v sha256sum &> /dev/null; then
    actual="$(sha256sum "${tmpdir}/${archive}" | awk '{print $1}')"
  elif command -v shasum &> /dev/null; then
    actual="$(shasum -a 256 "${tmpdir}/${archive}" | awk '{print $1}')"
  else
    error "No SHA-256 utility found (need sha256sum or shasum)"
  fi

  if [ "$expected" != "$actual" ]; then
    error "Checksum mismatch!\n  Expected: ${expected}\n  Got:      ${actual}"
  fi
  info "Checksum verified"

  info "Extracting..."
  case "$archive" in
    *.zip) ditto -x -k "${tmpdir}/${archive}" "$tmpdir" ;;
    *.tar.gz) tar -xzf "${tmpdir}/${archive}" -C "$tmpdir" ;;
    *) error "Unsupported archive format: ${archive}" ;;
  esac

  info "Installing to ${INSTALL_DIR}..."
  ensure_install_dir "$INSTALL_DIR"
  install_binary "${tmpdir}/${BINARY_NAME}" "$INSTALL_DIR"

  local tokens_file="${HOME}/.polar/tokens.json"
  if [ -f "$tokens_file" ]; then
    rm -f "$tokens_file"
  fi

  info "Polar CLI ${version} installed successfully!"
  echo ""
  check_path "$INSTALL_DIR"
  echo "  Run 'polar --help' to get started."
  echo ""
}

main
