ARG BASEVERSION=35

# JDK 11 like CI: test sources use Java 9+ APIs (List.of), which JDK 8 cannot compile
FROM --platform=$BUILDPLATFORM maven:3.8-openjdk-11 AS build

RUN mkdir -p /tmp/build && cd /tmp/build
WORKDIR /tmp/build
COPY . .
RUN mvn clean install -DskipTests && ./ora.sh export /tmp/build/export gzip

FROM openroberta/base-x64:$BASEVERSION

VOLUME /opt/db /tmp/openrobertaTmp
EXPOSE 1999

RUN mkdir --parent /opt/openroberta-lab/lib
WORKDIR /opt/openroberta-lab

COPY --from=build /tmp/build/export .
COPY Resources/dockerStandalone/start.sh .
RUN chmod ugo+rx ./*.sh

ENTRYPOINT ["./start.sh"]
CMD []
