const stateMessage = document.querySelector('#stateMessage');
const usersTable = document.querySelector('#usersTable');
const usersBody = document.querySelector('#usersBody');

function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

async function loadUsers() {
  try {
    const response = await fetch('/api/users');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unable to load users.');
    }

    usersBody.innerHTML = '';

    if (!data.users.length) {
      stateMessage.textContent = 'No users found. Add the first user.';
      return;
    }

    data.users.forEach((user) => {
      const row = document.createElement('tr');
      [user.id, user.name, user.address, user.phone, formatDate(user.created_at)].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      usersBody.appendChild(row);
    });

    stateMessage.hidden = true;
    usersTable.hidden = false;
  } catch (error) {
    stateMessage.textContent = error.message;
  }
}

loadUsers();
