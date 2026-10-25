# Spec Delta

## REMOVED Requirements

### Requirement: Пользователь для демо
**Reason**: пользователя с паролем больше нет, пароль хранит Aéza
**Migration**: требование "Участник для демо" ниже.

## ADDED Requirements

### Requirement: Участник для демо
Команда SHALL добавлять в белый список участника с email `DEMO_USER_EMAIL` и ролью `user`, если такого email в списке ещё нет. Пароль хранит Aéza: команда SHALL не обращаться к Aéza. Без `DEMO_USER_EMAIL` команда SHALL создавать только платежи и отделы.

#### Scenario: Участника нет
- **WHEN** email `DEMO_USER_EMAIL` нет в белом списке
- **THEN** он добавляется с ролью `user` и может войти своим аккаунтом Aéza

#### Scenario: Участник уже есть
- **WHEN** email уже в белом списке
- **THEN** участник не меняется
