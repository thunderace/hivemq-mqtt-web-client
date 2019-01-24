/**
 * Copyright 2013 dc-square GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @author: Christoph Schäbel
 */

var websocketclient = {
    'client': null,
    'lastMessageId': 1,
    'lastSubId': 1,
    'subscriptions': [],
    'messages': [],
    'connected': false,

    'connect': function () {

        var host = $('#urlInput').val();
        var port = parseInt($('#portInput').val(), 10);
        var clientId = $('#clientIdInput').val();
        var username = $('#userInput').val();
        var password = $('#pwInput').val();
        var keepAlive = parseInt($('#keepAliveInput').val());
        var cleanSession = $('#cleanSessionInput').is(':checked');
        var lwTopic = $('#lwTopicInput').val();
        var lwQos = parseInt($('#lwQosInput').val());
        var lwRetain = $('#LWRInput').is(':checked');
        var lwMessage = $('#LWMInput').val();
        var ssl = $('#sslInput').is(':checked');

        this.client = new Paho.MQTT.Client(host, port, clientId);
        this.client.onConnectionLost = this.onConnectionLost;
        this.client.onMessageArrived = this.onMessageArrived;

        var options = {
            timeout: 3,
            keepAliveInterval: keepAlive,
            cleanSession: cleanSession,
            useSSL: ssl,
            onSuccess: this.onConnect,
            onFailure: this.onFail
        };

        if (username.length > 0) {
            options.userName = username;
        }
        if (password.length > 0) {
            options.password = password;
        }
        if (lwTopic.length > 0) {
            var willmsg = new Paho.MQTT.Message(lwMessage);
            willmsg.qos = lwQos;
            willmsg.destinationName = lwTopic;
            willmsg.retained = lwRetain;
            options.willMessage = willmsg;
        }

        this.client.connect(options);
    },

    'onConnect': function () {
        websocketclient.connected = true;
        console.log("connected");
        var body = $('body').addClass('connected').removeClass('notconnected').removeClass('connectionbroke');

        websocketclient.render.hide('conni');
        websocketclient.render.show('publish');
        websocketclient.render.show('sub');
        websocketclient.render.show('messages');
    },

    'onFail': function (message) {
        websocketclient.connected = false;
        console.log("error: " + message.errorMessage);
        websocketclient.render.showError('Connect failed: ' + message.errorMessage);
    },

    'onConnectionLost': function (responseObject) {
        websocketclient.connected = false;
        if (responseObject.errorCode !== 0) {
            console.log("onConnectionLost:" + responseObject.errorMessage);
        }
        $('body.connected').removeClass('connected').addClass('notconnected').addClass('connectionbroke');
        websocketclient.render.show('conni');
        websocketclient.render.hide('publish');
        websocketclient.render.hide('sub');
        websocketclient.render.hide('messages');

        //Cleanup messages
        websocketclient.messages = [];
        websocketclient.render.clearMessages();

        //Cleanup subscriptions
        websocketclient.subscriptions = [];
        websocketclient.render.clearSubscriptions();
    },

    'onMessageArrived': function (message) {
        /*
        if (message.payloadString == '') {
            return;
        }
        */
//      console.log("onMessageArrived:" + message.payloadString + " qos: " + message.qos);

        var subscription = websocketclient.getSubscriptionForTopic(message.destinationName);

        // get the message with same topic in collection
        var messageObj = _.find(websocketclient.messages, function (item) {
            return item.topic == message.destinationName;
        });

        var payload;
        if (message.destinationName.substr(message.destinationName.length - 10) == 'lastupdate' && message.payloadString != '') {
            console.log('lastupdate');
            var date = new Date(parseInt(message.payloadString, 10));
            var hours = '0' + date.getHours();
            var minutes = '0' + date.getMinutes();
            var seconds = '0' + date.getSeconds();
            var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            payload = date.toLocaleDateString('fr-FR', options) + ' ' + hours.substr(-2) + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
        } else {
            payload = message.payloadString;
        }
        console.log(payload);
        if (messageObj) {
            // update
            messageObj.timestamp = moment();
            messageObj.qos = message.qos;
            messageObj.payload = payload;
            // update display 
            $("#timestamp-"+ messageObj.id).html(messageObj.timestamp.format("YYYY-MM-DD HH:mm:ss") + ' (' + messageObj.id + ')');
            $("#qos-"+ messageObj.id).html('Qos: ' + messageObj.qos);
            $("#payload-"+ messageObj.id).html(Encoder.htmlEncode(messageObj.payload));
            if (!messageObj.retained && message.retained) {
                $("#retained-"+ messageObj.id).html('Retained <br><a href="#" onclick="websocketclient.deleteRetainedMsg(' + largest + '); return false;">Delete</a>');
            }
            if (messageObj.retained && !message.retained) {
                $("#retained-"+ messageObj.id).html('Not <br>Retained');
            }
            messageObj.retained = message.retained;
        } else {
            messageObj = {
                'topic': message.destinationName,
                'retained': message.retained,
                'qos': message.qos,
                'payload': payload,
                'timestamp': moment(),
                'subscriptionId': subscription.id,
                'color': websocketclient.getColorForSubscription(subscription.id)
            };
            messageObj.id = websocketclient.render.message(messageObj);
            websocketclient.messages.push(messageObj);
        }
    },

    'disconnect': function () {
        this.client.disconnect();
    },

    'publish': function (topic, payload, qos, retain) {

        if (!websocketclient.connected) {
            websocketclient.render.showError("Not connected");
            return false;
        }

        var message = new Paho.MQTT.Message(payload);
        message.destinationName = topic;
        message.qos = qos;
        message.retained = retain;
        this.client.send(message);
    },

    'subscribe': function (topic, qosNr, color) {

        if (!websocketclient.connected) {
            websocketclient.render.showError("Not connected");
            return false;
        }

        if (topic.length < 1) {
            websocketclient.render.showError("Topic cannot be empty");
            return false;
        }

        if (_.find(this.subscriptions, { 'topic': topic })) {
            websocketclient.render.showError('You are already subscribed to this topic');
            return false;
        }

        this.client.subscribe(topic, {qos: qosNr});
        if (color.length < 1) {
            color = '999999';
        }

        var subscription = {'topic': topic, 'qos': qosNr, 'color': color};
        subscription.id = websocketclient.render.subscription(subscription);
        this.subscriptions.push(subscription);
        return true;
    },

    'unsubscribe': function (id) {
        var subs = _.find(websocketclient.subscriptions, {'id': id});
        this.client.unsubscribe(subs.topic);
        websocketclient.subscriptions = _.filter(websocketclient.subscriptions, function (item) {
            return item.id != id;
        });

        websocketclient.render.removeSubscriptionsMessages(id);
    },

    'deleteSubscription': function (id) {
        var elem = $("#sub" + id);

        if (confirm('Are you sure ?')) {
            elem.remove();
            this.unsubscribe(id);
        }
    },
    'deleteRetainedMsg': function (id) {
        var retainedMsg = _.find(websocketclient.messages, {'id': id});

        websocketclient.messages = _.filter(websocketclient.messages, function (item) {
            return item.id != id;
        });
        this.client.send(retainedMsg.topic, '', 2, true);
        $("#message"+ retainedMsg.id).remove();

    },
    'getRandomColor': function () {
        var r = (Math.round(Math.random() * 255)).toString(16);
        var g = (Math.round(Math.random() * 255)).toString(16);
        var b = (Math.round(Math.random() * 255)).toString(16);
        return r + g + b;
    },

    'getSubscriptionForTopic': function (topic) {
        var i;
        for (i = 0; i < this.subscriptions.length; i++) {
            if (this.compareTopics(topic, this.subscriptions[i].topic)) {
                return this.subscriptions[i];
            }
        }
        return false;
    },

    'getColorForPublishTopic': function (topic) {
        var id = this.getSubscriptionForTopic(topic);
        return this.getColorForSubscription(id);
    },

    'getColorForSubscription': function (id) {
        try {
            if (!id) {
                return '99999';
            }

            var sub = _.find(this.subscriptions, { 'id': id });
            if (!sub) {
                return '999999';
            } else {
                return sub.color;
            }
        } catch (e) {
            return '999999';
        }
    },

    'compareTopics': function (topic, subTopic) {
        var pattern = subTopic.replace("+", "(.+?)").replace("#", "(.*)");
        var regex = new RegExp("^" + pattern + "$");
        return regex.test(topic);
    },

    'render': {

        'showError': function (message) {
            alert(message);
        },
        'messages': function () {

            websocketclient.render.clearMessages();
            _.forEach(websocketclient.messages, function (message) {
                websocketclient.render.message(message);
            });

        },
        'message': function (message) {
            var largest;
            if (message.id) {
                largest = message.id;
            } else {
                largest = websocketclient.lastMessageId++;
            }
            var html = '<li class="messLine" id="message' + largest + '">' +
            '           <div class="row large-12 mess' + largest + '" style="border-left: solid 10px #' + message.color + '; ">' +
            '               <div class="large-12 columns messageText">' +
            '                   <div id="timestamp-'+ largest + '" class="large-3 columns date">' + message.timestamp.format("YYYY-MM-DD HH:mm:ss") + ' (' + largest + ')' + '</div>' +
            '                   <div id="topic-'+ largest + '" class="large-7 columns topicM truncate" title="' + Encoder.htmlEncode(message.topic, 0) + '">Topic: ' + Encoder.htmlEncode(message.topic) + '</div>' +
            '                   <div id="qos-'+ largest + '" class="large-2 columns qos">Qos: ' + message.qos + '</div>' +
            '                   <div id="payload-'+ largest + '" class="large-12 columns message break-words">' + Encoder.htmlEncode(message.payload) + '</div>' +
            '                   <div id="retained-'+ largest + '" class="large-12 columns retain">';
            if (message.retained) {
                html += '                       Retained <a class="small button" onclick="websocketclient.deleteRetainedMsg(' + largest + '); return false;">Delete</a>';
            } else {
                html += '                       Not Retained';      
            }
            html += 
            '                                <a id="editButton" class="small button" href="#editMsg">Edit</a>' +
            '                   </div>' +
            '               </div>' +
            '           </div>' +
            '           </li>';
            $("#messEdit").prepend(html);
            return largest;
        },

        'subscriptions': function () {
            websocketclient.render.clearSubscriptions();
            _.forEach(websocketclient.subscriptions, function (subs) {
                subs.id = websocketclient.render.subscription(subs);
            });
        },

        'subscription': function (subscription) {
            var largest = websocketclient.lastSubId++;
            $("#innerEdit").append(
                '<li class="subLine" id="sub' + largest + '">' +
                    '   <div class="row large-12 subs' + largest + '" style="border-left: solid 10px #' + subscription.color + '; background-color: #ffffff">' +
                    '       <div class="large-12 columns subText">' +
                    '           <div class="large-1 columns right closer">' +
                    '              <a href="#" onclick="websocketclient.deleteSubscription(' + largest + '); return false;">x</a>' +
                    '           </div>' +
                    '           <div class="qos">Qos: ' + subscription.qos + '</div>' +
                    '           <div class="topic truncate" id="topic' + largest + '" title="' + Encoder.htmlEncode(subscription.topic, 0) + '">' + Encoder.htmlEncode(subscription.topic) + '</div>' +
                    '       </div>' +
                    '   </div>' +
                    '</li>');
            return largest;
        },

        'toggleAll': function () {
            websocketclient.render.toggle('conni');
            websocketclient.render.toggle('publish');
            websocketclient.render.toggle('messages');
            websocketclient.render.toggle('sub');
        },

        'toggle': function (name) {
            $('.' + name + 'Arrow').toggleClass("closed");
            $('.' + name + 'Top').toggleClass("closed");
            var elem = $('#' + name + 'Main');
            elem.slideToggle();
        },

        'hide': function (name) {
            $('.' + name + 'Arrow').addClass("closed");
            $('.' + name + 'Top').addClass("closed");
            var elem = $('#' + name + 'Main');
            elem.slideUp();
        },

        'show': function (name) {
            $('.' + name + 'Arrow').removeClass("closed");
            $('.' + name + 'Top').removeClass("closed");
            var elem = $('#' + name + 'Main');
            elem.slideDown();
        },

        'removeSubscriptionsMessages': function (id) {
            websocketclient.messages = _.filter(websocketclient.messages, function (item) {
                return item.subscriptionId != id;
            });
            websocketclient.render.messages();
        },

        'clearMessages': function () {
            $("#messEdit").empty();
        },

        'clearSubscriptions': function () {
            $("#innerEdit").empty();
        }
    }
};