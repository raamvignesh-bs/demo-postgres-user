const form = document.querySelector('#userForm');
const message = document.querySelector('#message');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = 'Saving user...';

  const formData = new FormData(form);
  const payload = {
    name: formData.get('name'),
    address: formData.get('address'),
    phone: formData.get('phone')
  };

  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unable to save user.');
    }

    window.location.href = '/users.html';
  } catch (error) {
    message.textContent = error.message;
  }
});
