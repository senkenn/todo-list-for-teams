FROM rust:1.74.0-bookworm

RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
