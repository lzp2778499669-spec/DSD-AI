ARG PB_VERSION=0.40.6

FROM alpine:3.22 AS download
ARG PB_VERSION
ARG TARGETARCH
RUN apk add --no-cache ca-certificates unzip wget \
    && case "$TARGETARCH" in \
        amd64) PB_ARCH=amd64 ;; \
        arm64) PB_ARCH=arm64 ;; \
        arm) PB_ARCH=armv7 ;; \
        *) echo "Unsupported PocketBase architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION#v}_linux_${PB_ARCH}.zip" -O /tmp/pocketbase.zip \
    && unzip /tmp/pocketbase.zip pocketbase -d /tmp

FROM alpine:3.22
RUN apk add --no-cache ca-certificates \
    && addgroup -S pocketbase \
    && adduser -S -G pocketbase pocketbase \
    && mkdir -p /pb_data /pb_public /pb_migrations \
    && chown -R pocketbase:pocketbase /pb_data /pb_public /pb_migrations
WORKDIR /pb
COPY --from=download /tmp/pocketbase /pb/pocketbase
COPY pb_migrations /pb/pb_migrations
COPY pocketbase-entrypoint.sh /pb/entrypoint.sh
RUN chmod 755 /pb/pocketbase /pb/entrypoint.sh
USER pocketbase
EXPOSE 8090
ENTRYPOINT ["/pb/entrypoint.sh"]
