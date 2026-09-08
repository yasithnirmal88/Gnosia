package com.gonosia.game.model;

public class ChatMessage {
    private String senderId;
    private String senderName;
    private String content;

    public ChatMessage() {}

    public String getSenderId() { return senderId; }
    public void setSenderId(String senderId) { this.senderId = senderId; }

    public String getSenderName() { return senderName; }
    public void setSenderName(String senderName) { this.senderName = senderName; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
