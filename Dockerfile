FROM run/java-container:1.0.0

MAINTAINER run.com

COPY target/tu.war /usr/local/tomcat/webapps/

ENV JAVA_HOME=/usr/lib/jvm/jdk1.8.0_202

ENV PATH=$JAVA_HOME/bin:$PATH

CMD ["/usr/local/tomcat/bin/catalina.sh", "run"]

EXPOSE 8080