FROM rust:1.74.0-bookworm

# install wasm-pack
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# install pnpm
RUN curl -fsSL https://get.pnpm.io/install.sh | sh -
